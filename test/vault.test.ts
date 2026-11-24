import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVaultArgs, runVaultCommand, runVaultCommandAsync, parseVaultHits, publicVaultPath } from "../src/vault.js";
const hits = JSON.stringify([{ file: "qmd://obsidian/workflows/example.md", title: "Example", snippet: "SAFE RESULT" }, { file: "qmd://obsidian/credentials/key.md", title: "PRIVATE", snippet: "DO NOT DISCLOSE" }]);

test("builds structured bounded searches and paged get in the intended collection", () => {
  assert.deepEqual(buildVaultArgs("search", "deploy vps"), ["search", "deploy vps", "-c", "obsidian", "--json", "-n", "12"]);
  assert.deepEqual(buildVaultArgs("get", "workflows/foo.md 81"), ["get", "qmd://obsidian/workflows/foo.md:81", "-l", "80"]);
  assert.equal(buildVaultArgs("nope", "x"), null);
  assert.equal(buildVaultArgs("search", "--help"), null);
});

test("private paths, URI tricks and traversal never reach QMD", () => {
  for (const path of ["credentials/key.md", "session_logs/private.md", "secrets/key.md", "../key.md", "workflows/../key.md", "qmd://vault/x.md", "qmd://obsidian/%63redentials/key.md", "qmd://obsidian/%252e%252e/x.md", "/etc/passwd", "workflows/x.md?x", "workflows/secret\\key.md"]) {
    assert.equal(publicVaultPath(path), null, path);
    let calls = 0; const output = runVaultCommand(`get ${path}`, () => { calls++; return "SECRET"; });
    assert.equal(calls, 0); assert(output.startsWith("Vault-Fehler:")); assert(!output.includes("SECRET"));
  }
});

test("private snippets are filtered before returning search results", () => {
  assert.equal(parseVaultHits(hits).length, 1);
  const result = runVaultCommand("some query", (args) => { assert.equal(args[0], "search"); return hits; });
  assert(result.includes("SAFE RESULT")); assert(!result.includes("DO NOT DISCLOSE")); assert(!result.includes("PRIVATE"));
});

test("errors and malformed results do not leak process output", async () => {
  assert(runVaultCommand("search x", () => "[]").includes("Nichts"));
  assert(!runVaultCommand("search x", () => { throw new Error("SECRET STDERR"); }).includes("SECRET"));
  assert(runVaultCommand("search x", () => "invalid").startsWith("Vault-Fehler:"));
  const result = await runVaultCommandAsync("search x", undefined, async () => hits);
  assert(result.includes("SAFE RESULT"));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runVaultCommandAsync("search x", controller.signal, async () => { throw new Error("aborted"); }));
});
