import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getFreeModelsApiKey, getFreeModelsBaseUrl } from "../src/runtime/free-models.js";
import { detectProvider, getProvider, listProviders, resolveModelName } from "../src/providers.js";
import { createApiKeyHelpers } from "../src/cli-bootstrap.js";
import { clearDiscoveredProviderModels, getDiscoveredProviderModels, refreshProviderModelCatalogs } from "../src/provider-model-discovery.js";

test("gateway settings rotate without copying keys; invalid state stays empty", t => {
  const home = mkdtempSync(join(tmpdir(), "morningstar-free-"));
  const previous = { ...process.env };
  t.after(() => { process.env = previous; rmSync(home, { recursive: true, force: true }); });
  process.env.OFM_HOME = home;
  delete process.env.FREE_MODELS_API_KEY;
  delete process.env.FREE_MODELS_BASE_URL;
  assert.equal(getFreeModelsApiKey(), "");
  writeFileSync(join(home, "settings.json"), JSON.stringify({ forwardKey: "fixture-first", standalonePort: 18903 }));
  assert.equal(getFreeModelsBaseUrl(), "http://127.0.0.1:18903/v1");
  const helpers = createApiKeyHelpers({}, () => { throw new Error("must not persist"); });
  assert.equal(helpers.getStoredApiKey("free-models"), "fixture-first");
  writeFileSync(join(home, "settings.json"), JSON.stringify({ forwardKey: "fixture-next", standalonePort: 18904 }));
  assert.equal(helpers.getStoredApiKey("free-models"), "fixture-next");
  assert.equal(getFreeModelsBaseUrl(), "http://127.0.0.1:18904/v1");
  writeFileSync(join(home, "settings.json"), "{");
  assert.equal(getFreeModelsApiKey(), "");
});

test("gateway secrets cannot target a remote host, URL credentials or redirect", async t => {
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  for (const url of ["https://example.com/v1", "http://127.0.0.1.evil.test/v1", "http://key@localhost/v1", "http://localhost/v1?key=x", "file:///tmp/a", "http://localhost/evil"]) {
    process.env.FREE_MODELS_BASE_URL = url;
    assert.throws(getFreeModelsBaseUrl);
  }
  process.env.FREE_MODELS_BASE_URL = "http://127.0.0.1:18905/v1";
  process.env.FREE_MODELS_API_KEY = "fixture-gateway-key";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: unknown, options: RequestInit) => {
    calls++;
    assert.equal(String(url), "http://127.0.0.1:18905/v1/chat/completions");
    assert.equal(options.redirect, "manual");
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer fixture-gateway-key");
    const body = JSON.parse(String(options.body));
    assert.equal(body.model, "nvidia/example:free");
    assert.deepEqual(body.tools.map((x: any) => x.function.name), ["read"]);
    return new Response("redirect rejected", { status: 302, headers: { Location: "https://example.com" } });
  });
  const config = { provider: "free-models", model: "free-models/nvidia/example:free", apiKey: "stale-other-provider", baseUrl: "https://example.com", maxTokens: 100, temperature: 0, toolAllowlist: ["read"] };
  await assert.rejects(async () => { for await (const _ of getProvider(config).streamChat([{ role: "user", content: "test" }], config, undefined, true)) {} }, /302/);
  assert.equal(calls, 1);
  assert.equal(detectProvider(config.model), "free-models");
  assert.equal(resolveModelName(config.model, "free-models"), "nvidia/example:free");
});

test("gateway catalog replaces removed models, reports hosted inference and clears on failure", async t => {
  clearDiscoveredProviderModels();
  const previous = process.env.FREE_MODELS_BASE_URL;
  process.env.FREE_MODELS_BASE_URL = "http://127.0.0.1:18906/v1";
  t.after(() => { if (previous === undefined) delete process.env.FREE_MODELS_BASE_URL; else process.env.FREE_MODELS_BASE_URL = previous; clearDiscoveredProviderModels(); });
  let ids = ["vendor/old:free", "vendor/keep:free"];
  let fail = false;
  const fetchFn: typeof fetch = async (url, options) => {
    if (String(url).includes("18906")) {
      assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer fixture");
      return new Response(JSON.stringify({ data: ids.map(id => ({ id })) }), { status: fail ? 503 : 200 });
    }
    return new Response(JSON.stringify({ data: [], models: [] }));
  };
  const refresh = () => refreshProviderModelCatalogs(p => p === "free-models" ? "fixture" : "", { fetchFn, force: true, openCodeModelsFn: async () => [] });
  const initial = await refresh();
  assert.equal(getDiscoveredProviderModels("free-models")?.length, 2, JSON.stringify(initial));
  ids = ["vendor/new:free"];
  await refresh();
  assert.deepEqual(getDiscoveredProviderModels("free-models"), ["free-models/vendor/new:free"]);
  assert.equal(listProviders().find(x => x.name === "free-models")?.modelMetadata?.["free-models/vendor/new:free"].deployment, "hosted");
  fail = true;
  assert.equal((await refresh()).find(x => x.provider === "free-models")?.status, "failed");
  assert.equal(getDiscoveredProviderModels("free-models"), undefined);
});
