import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  executeToolCall,
  executeToolCalls,
  fetchUrl,
  globSearch,
  grepSearch,
  isBlockedFetchAddress,
  isNativeToolParallelSafe,
  listDir,
  parseCommandArguments,
  parseToolCalls,
  resolvePublicFetchTarget,
  type FetchAddressLookup,
  type FetchHopRequester,
  writeFile,
} from "../src/tools.js";
import { disableSandbox, enableSandbox, isSandboxAvailable } from "../src/sandbox.js";

test("parseToolCalls normalizes calls without executing them", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mcli-parse-"));
  const marker = join(root, "should-not-exist");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const parsed = parseToolCalls(`before <tool:bash>touch "${marker}"</tool> after`);
  assert.equal(parsed.calls.length, 1);
  assert.equal(parsed.calls[0].tool, "bash");
  assert.deepEqual(parsed.calls[0].args, { command: `touch "${marker}"` });
  assert.equal(parsed.cleanResponse, "before  after");
  assert.equal(existsSync(marker), false);
});

test("single-call executor runs an explicitly selected parsed call", async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "mcli-single-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));

  const parsed = parseToolCalls("<tool:write>selected.txt\napproved</tool>");
  const result = await executeToolCall(parsed.calls[0], workspace);
  assert.equal(result.success, true);
  assert.equal(readFileSync(join(workspace, "selected.txt"), "utf-8"), "approved");
});

test("writeFile and legacy executeToolCalls deny traversal writes", async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "mcli-boundary-"));
  const outsideName = `${basename(workspace)}-outside.txt`;
  const outside = join(dirname(workspace), outsideName);
  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(outside, { force: true });
  });

  const direct = writeFile(`../${outsideName}`, "no", workspace);
  assert.equal(direct.success, false);
  const legacy = await executeToolCalls(`<tool:write>../${outsideName}\nno</tool>`, workspace);
  assert.equal(legacy.results[0].success, false);
  assert.equal(existsSync(outside), false);
});

test("writeFile denies a new file through a symlinked outside directory", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mcli-write-symlink-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  symlinkSync(outside, join(workspace, "link"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = writeFile("link/escaped.txt", "no", workspace);
  assert.equal(result.success, false);
  assert.equal(existsSync(join(outside, "escaped.txt")), false);
});

test("grep metacharacters are passed literally and cannot execute a shell", (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "mcli-grep-"));
  const marker = join(workspace, "injected");
  writeFileSync(join(workspace, "sample.txt"), "ordinary content\n", "utf-8");
  t.after(() => rmSync(workspace, { recursive: true, force: true }));

  const pattern = `not-present"; touch "${marker}"; echo "`;
  const result = grepSearch(pattern, workspace, "*.txt");
  assert.equal(result.success, true);
  assert.equal(existsSync(marker), false);
});

test("GitHub CLI arguments are parsed without shell expansion", () => {
  assert.deepEqual(
    parseCommandArguments('pr create --title "Fix build" --body "literal; $(touch nope)"'),
    ["pr", "create", "--title", "Fix build", "--body", "literal; $(touch nope)"],
  );
  assert.equal(parseCommandArguments('pr create --title "unfinished'), null);
});

test("list and glob deny workspace traversal paths", async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "mcli-search-boundary-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));

  assert.equal(listDir("..", workspace).success, false);
  assert.equal((await globSearch("../*", workspace)).success, false);
});

test("legacy executeToolCalls still parses, executes, and cleans a normal call", async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "mcli-legacy-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));

  const result = await executeToolCalls("hello <tool:write>ok.txt\nworks</tool> world", workspace);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].success, true);
  assert.equal(result.cleanResponse, "hello  world");
  assert.equal(readFileSync(join(workspace, "ok.txt"), "utf-8"), "works");
});

test("mutating native tools are never classified as parallel-safe", () => {
  for (const tool of ["write", "edit", "delete", "bash", "notebook_edit"]) {
    assert.equal(isNativeToolParallelSafe(tool), false, tool);
  }
  assert.equal(isNativeToolParallelSafe("read"), true);
});

test("bash routes commands through the enabled OS sandbox", (t) => {
  if (!isSandboxAvailable().available) {
    t.skip("OS sandbox tool is unavailable");
    return;
  }
  const workspace = mkdtempSync(join(process.cwd(), ".mcli-sandbox-"));
  const marker = join(dirname(workspace), `${basename(workspace)}-outside`);
  t.after(() => {
    disableSandbox();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(marker, { force: true });
  });

  enableSandbox({ allowedPaths: [workspace], networkAccess: false });
  const result = executeToolCall({ tool: "bash", args: { command: `printf injected > "${marker}"` } }, workspace);
  return result.then((resolved) => {
    assert.equal(resolved.success, false);
    assert.equal(existsSync(marker), false);
  });
});

test("aborting foreground bash terminates descendants before a delayed side effect", async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "mcli-abort-bash-"));
  const marker = join(workspace, "late-marker");
  const controller = new AbortController();
  t.after(() => rmSync(workspace, { recursive: true, force: true }));

  const execution = executeToolCall(
    {
      tool: "bash",
      args: {
        command:
          `node -e 'setTimeout(() => require("node:fs").writeFileSync(process.argv[1], "late"), 250)' `
          + JSON.stringify(marker),
      },
    },
    workspace,
    controller.signal,
  );
  setTimeout(() => controller.abort(), 30);

  const result = await execution;
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(result.success, false);
  assert.match(result.result, /Abgebrochen/);
  assert.equal(existsSync(marker), false);
});

test("fetch address guard blocks non-public IPv4 and IPv6 ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "4000::1",
  ]) {
    assert.equal(isBlockedFetchAddress(address), true, address);
  }
  assert.equal(isBlockedFetchAddress("8.8.8.8"), false);
  assert.equal(isBlockedFetchAddress("2606:4700:4700::1111"), false);
});

test("fetch validation blocks credentials, localhost variants, and private DNS", async () => {
  const privateLookup: FetchAddressLookup = async () => [
    { address: "10.23.4.5", family: 4 },
  ];

  for (const url of [
    "http://localhost/admin",
    "http://LOCALHOST./admin",
    "http://127.0.0.1/admin",
    "http://0177.0.0.1/admin",
    "http://2130706433/admin",
    "http://0x7f000001/admin",
    "http://[::1]/admin",
    "http://169.254.169.254/latest/meta-data",
    "https://user:password@example.com/private",
  ]) {
    const result = await resolvePublicFetchTarget(url, privateLookup);
    assert.equal(result.ok, false, url);
  }

  const dnsResult = await resolvePublicFetchTarget(
    "https://attacker.example/",
    privateLookup,
  );
  assert.equal(dnsResult.ok, false);
  if (!dnsResult.ok) assert.match(dnsResult.reason, /private|reservierte/);
});

test("fetch validates every redirect and never requests a private redirect target", async () => {
  const lookup: FetchAddressLookup = async () => [
    { address: "93.184.216.34", family: 4 },
  ];
  const requested: string[] = [];
  const request: FetchHopRequester = async (url) => {
    requested.push(url.toString());
    return {
      statusCode: 302,
      headers: { location: "http://127.0.0.1/internal" },
      body: "",
    };
  };

  const result = await fetchUrl("https://public.example/start", undefined, {
    lookup,
    request,
  });
  assert.equal(result.success, false);
  assert.match(result.result, /Fetch blockiert/);
  assert.deepEqual(requested, ["https://public.example/start"]);
});

test("fetch caps manually followed public redirects", async () => {
  const lookup: FetchAddressLookup = async () => [
    { address: "93.184.216.34", family: 4 },
  ];
  let requests = 0;
  const request: FetchHopRequester = async () => {
    requests += 1;
    return {
      statusCode: 302,
      headers: { location: `/hop-${requests}` },
      body: "",
    };
  };

  const result = await fetchUrl("https://public.example/start", undefined, {
    lookup,
    request,
    maxRedirects: 2,
  });
  assert.equal(result.success, false);
  assert.match(result.result, /Mehr als 2 Redirects/);
  assert.equal(requests, 3);
});

test("fetch rejects an oversized response before text processing", async () => {
  const lookup: FetchAddressLookup = async () => [
    { address: "93.184.216.34", family: 4 },
  ];
  const request: FetchHopRequester = async () => ({
    statusCode: 200,
    headers: {},
    body: "x".repeat(2 * 1024 * 1024 + 1),
  });

  const result = await fetchUrl("https://public.example/large", undefined, {
    lookup,
    request,
  });
  assert.equal(result.success, false);
  assert.match(result.result, /groesser als 2 MB/);
});
