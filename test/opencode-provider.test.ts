import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenCodeFreeModel, parseOpenCodeEvent } from "../src/providers/opencode-cli.js";
import { detectProvider, getProvider } from "../src/providers.js";
import { KEYLESS_PROVIDERS } from "../src/cli-bootstrap.js";
import { clearDiscoveredProviderModels, getDiscoveredProviderModels, refreshProviderModelCatalogs } from "../src/provider-model-discovery.js";

test("OpenCode accepts only its free model namespace and uses Morningstar tool protocol", () => {
  for (const id of ["opencode/big-pickle", "opencode/example-free"]) {
    assert.ok(isOpenCodeFreeModel(id));
    assert.equal(detectProvider(id), "opencode");
  }
  for (const id of ["opencode/gpt-paid", "vendor/free", "opencode/../free", "opencode/model-free\n"]) assert.equal(isOpenCodeFreeModel(id), false);
  assert.ok(KEYLESS_PROVIDERS.has("opencode"));
  assert.equal(getProvider({ model: "opencode/example-free", apiKey: "", baseUrl: "", maxTokens: 100, temperature: 0 }).supportsTools, false);
});

test("OpenCode response parser preserves text, rejects quota and accidental internal tool calls", () => {
  assert.deepEqual(parseOpenCodeEvent(JSON.stringify({ type: "text", part: { text: '<tool:read>{"filePath":"fixture.txt"}</tool>' } })), { type: "content", text: '<tool:read>{"filePath":"fixture.txt"}</tool>' });
  assert.equal(parseOpenCodeEvent('{"type":"step_start"}'), undefined);
  assert.throws(() => parseOpenCodeEvent('{"type":"error","error":{"message":"Free usage limit reached","status":429}}'), /OpenCode \(429\).*Free usage/);
  assert.throws(() => parseOpenCodeEvent('{"type":"tool_use"}'), /Morningstar owns/);
  assert.throws(() => parseOpenCodeEvent('{"type":'), /invalid JSON/);
});

test("OpenCode catalog updates replace models and failure removes stale choices", async t => {
  clearDiscoveredProviderModels(); t.after(clearDiscoveredProviderModels);
  let ids = ["opencode/example-free"];
  let fail = false;
  const refresh = () => refreshProviderModelCatalogs(() => "", {
    force: true,
    fetchFn: async () => new Response('{"data":[],"models":[]}'),
    openCodeModelsFn: async () => { if (fail) throw new Error("offline"); return ids; },
  });
  await refresh(); assert.deepEqual(getDiscoveredProviderModels("opencode"), ids);
  ids = ["opencode/new-free"]; await refresh(); assert.deepEqual(getDiscoveredProviderModels("opencode"), ids);
  fail = true; assert.equal((await refresh()).find(p => p.provider === "opencode")?.status, "failed");
  assert.equal(getDiscoveredProviderModels("opencode"), undefined);
});
