import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const git = args => execFileSync("git", args, { encoding: "utf8" });
const worktree = process.argv[2] === "--worktree";
const packageRoot = process.argv[2] === "--package" ? process.argv[3] : undefined;
if (process.argv.length > 2 && !worktree && !packageRoot) throw new Error("Usage: check-public-hygiene.mjs [--worktree | --package <extracted-directory>]");
function walk(root, directory = root) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return lstatSync(path).isDirectory() ? walk(root, path) : [relative(root, path).replaceAll("\\", "/")];
  });
}


// Scan the exact staged tree, including generated code and source maps. Working
// copies and ignored local files cannot accidentally make this check pass.
const entries = packageRoot ? [] : git(["ls-files", "--stage", "-z"]).split("\0").filter(Boolean);
const diskPaths = packageRoot ? walk(resolve(packageRoot)) : worktree
  ? [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))] : undefined;
const objects = entries.map(entry => entry.split(" ")[1]);
const batch = packageRoot || worktree ? Buffer.alloc(0) : execFileSync("git", ["cat-file", "--batch"], { input: objects.join("\n") + "\n", maxBuffer: 128 * 1024 * 1024 });
let offset = 0;
const findings = [];
for (const entry of diskPaths ?? entries) {
  let path, data;
  if (diskPaths) {
    path = entry;
    const absolute = resolve(packageRoot || ".", path);
    const stat = lstatSync(absolute);
    if (!stat.isFile()) { findings.push([path, "link or non-regular file"]); continue; }
    data = readFileSync(absolute);
    if (packageRoot && !/^(?:bin\/morningstar\.js|dist\/[^.][^\n]*\.(?:js|js\.map|d\.ts|d\.ts\.map)|scripts\/launch-ollama\.mjs|package\.json|README\.md|LICENSE|SECURITY\.md|PARITY\.md|docs\/distribution\.md)$/.test(path)) findings.push([path, "unexpected npm package file"]);
  } else {
    const match = /^(\d+) ([0-9a-f]+) (\d)\t([\s\S]+)$/.exec(entry);
    if (!match) throw new Error("Unexpected index entry");
    const [, mode, oid, stage, entryPath] = match;
    path = entryPath;
    if (stage !== "0") findings.push([path, "unmerged index"]);
    if (mode === "120000" || mode === "160000") findings.push([path, "link or submodule requires review"]);

    const end = batch.indexOf(10, offset);
    const header = batch.subarray(offset, end).toString("utf8");
    const object = /^([0-9a-f]+) blob (\d+)$/.exec(header);
    if (!object || object[1] !== oid) throw new Error("Invalid object response");
    const size = Number(object[2]);
    data = batch.subarray(end + 1, end + 1 + size);
    offset = end + 2 + size;
  }
  if (/(^|\/)(?:private|node_modules|\.next|\.vercel|\.morningstar|evidence|backups|sessions|credentials|logs)(\/|$)|(?:^|\/)\.env(?:\.|$)(?!example$)|\.(?:pem|key|log|bundle|tgz|zip|db|sqlite|sqlite3)$/i.test(path)) findings.push([path, "local state or private artifact"]);
  if (data.includes(0)) {
    if (!/^assets\/brand\/.+\.(?:png|ico)$/.test(path)) findings.push([path, "unreviewed binary"]);
    continue;
  }
  const text = data.toString("utf8");
  if (/<!-- BEGIN (?:MORNINGSTAR_PRIVATE_OPERATOR|PRIVATE_REPOSITORY_BOUNDARY) -->/.test(text)) findings.push([path, "private operator profile"]);
  // Example usernames are test fixtures. Real home paths and mesh hosts are not.
  if (/\/(?:Users|home)\/(?!example(?:\/|\b)|dev(?:\/|\b)|user(?:\/|\b)|test(?:\/|\b)|e…)[\w.-]+\//.test(text) || /C:(?:\\{1,2})Users(?:\\{1,2})(?!example(?:\\|\b)|dev(?:\\|\b)|user(?:\\|\b)|test(?:\\|\b))[\w.-]+(?:\\{1,2})/.test(text)) findings.push([path, "personal absolute path"]);
  if (/\btail[0-9a-f]{4,}\.(?:ts\.net|com)\b|\b[a-z0-9-]+\.ts\.net\b/i.test(text)) findings.push([path, "private mesh hostname"]);
  if (/(?:^|\n)(?:PINOKIO_SHARE_TOKEN|TELEGRAM_BOT_TOKEN|OPENAI_API_KEY)=[^\s<>]+/.test(text)) findings.push([path, "credential assignment"]);
  if (/https?:\/\/[^\s"'`<>]*private-archive/i.test(text)) findings.push([path, "private repository reference"]);
}
if (findings.length) {
  for (const [path, reason] of findings) console.error(`${path}: ${reason}`);
  process.exitCode = 1;
} else console.log(`Public hygiene: ${(diskPaths ?? entries).length} ${packageRoot ? "package" : worktree ? "working-tree" : "staged"} files checked; no blocked artifacts or private paths.`);
