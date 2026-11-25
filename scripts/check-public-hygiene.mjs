import { execFileSync } from "node:child_process";

// Scan the exact staged tree, including generated code and source maps. Working
// copies and ignored local files cannot accidentally make this check pass.
const entries = execFileSync("git", ["ls-files", "--stage", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const objects = entries.map(entry => entry.split(" ")[1]);
const batch = execFileSync("git", ["cat-file", "--batch"], { input: objects.join("\n") + "\n", maxBuffer: 128 * 1024 * 1024 });
let offset = 0;
const findings = [];
for (const entry of entries) {
  const match = /^(\d+) ([0-9a-f]+) (\d)\t([\s\S]+)$/.exec(entry);
  if (!match) throw new Error("Unexpected index entry");
  const [, mode, oid, stage, path] = match;
  if (stage !== "0") findings.push([path, "unmerged index"]);
  if (mode === "120000" || mode === "160000") findings.push([path, "link or submodule requires review"]);
  if (/(^|\/)(?:private|node_modules|\.next|\.vercel|\.morningstar|evidence|backups|sessions|credentials)(\/|$)|(?:^|\/)\.env(?:\.|$)(?!example$)|\.(?:pem|key|log|bundle|tgz|zip)$/i.test(path)) findings.push([path, "local state or private artifact"]);
  const end = batch.indexOf(10, offset);
  const header = batch.subarray(offset, end).toString("utf8");
  const object = /^([0-9a-f]+) blob (\d+)$/.exec(header);
  if (!object || object[1] !== oid) throw new Error("Invalid object response");
  const size = Number(object[2]);
  const data = batch.subarray(end + 1, end + 1 + size);
  offset = end + 2 + size;
  if (data.includes(0)) {
    if (!/^assets\/brand\/.+\.(?:png|ico)$/.test(path)) findings.push([path, "unreviewed binary"]);
    continue;
  }
  const text = data.toString("utf8");
  if (/<!-- BEGIN (?:MORNINGSTAR_PRIVATE_OPERATOR|PRIVATE_REPOSITORY_BOUNDARY) -->/.test(text)) findings.push([path, "private operator profile"]);
  // Example usernames are test fixtures. Real home paths and mesh hosts are not.
  if (/\/(?:Users|home)\/(?!example(?:\/|\b)|dev(?:\/|\b)|user(?:\/|\b)|test(?:\/|\b)|e…)[\w.-]+\//.test(text) || /C:(?:\\{1,2})Users(?:\\{1,2})(?!example(?:\\|\b)|dev(?:\\|\b)|user(?:\\|\b)|test(?:\\|\b))[\w.-]+(?:\\{1,2})/.test(text)) findings.push([path, "personal absolute path"]);
  if (/\btail[0-9a-f]{4,}\.(?:ts\.net|com)\b|\b[a-z0-9-]+\.ts\.net\b/i.test(text)) findings.push([path, "private mesh hostname"]);
  if (/https?:\/\/[^\s"'`<>]*private-archive/i.test(text)) findings.push([path, "private repository reference"]);
}
if (findings.length) {
  for (const [path, reason] of findings) console.error(`${path}: ${reason}`);
  process.exitCode = 1;
} else console.log(`Public hygiene: ${entries.length} staged files checked; no blocked artifacts or private paths.`);
