import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clearDiscoveredProviderModels,
  getDiscoveredProviderModels,
  getProviderModelRefreshStatus,
  refreshProviderModelCatalogs,
} from "../src/provider-model-discovery.js";
import { listProviders, resolveModelName } from "../src/providers.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("live discovery normalizes provider ids and keeps only generation models", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);

  const fetchFn: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("anthropic")) {
      return jsonResponse({ data: [
        { id: "claude-opus-5" },
        { id: "embedding-not-a-claude-model" },
      ] });
    }
    if (url.includes("openai.com")) {
      return jsonResponse({ data: [
        { id: "gpt-5.2" },
        { id: "gpt-image-1" },
        { id: "gpt-realtime" },
        { id: "gpt-4o-mini-transcribe" },
        { id: "gpt-4o-audio-preview" },
        { id: "gpt-4o-mini-tts" },
        { id: "text-embedding-3-large" },
        { id: "omni-moderation-latest" },
        { id: "whisper-1" },
      ] });
    }
    if (url.includes("deepseek")) {
      return jsonResponse({ data: [{ id: "deepseek-chat" }] });
    }
    if (url.includes("googleapis")) {
      return jsonResponse({ models: [
        {
          name: "models/gemini-3.6-flash",
          baseModelId: "gemini-3.6-flash",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/text-embedding-004",
          supportedGenerationMethods: ["embedContent"],
        },
      ] });
    }
    if (url.includes("nvidia")) {
      return jsonResponse({ data: [
        { id: "meta/llama-4" },
        { id: "nvidia/nemotron-chat" },
        { id: "nvidia/nv-embed-v2" },
      ] });
    }
    if (url.includes("github")) {
      return jsonResponse([
        {
          id: "openai/gpt-4.1",
          supported_output_modalities: ["text"],
        },
      ]);
    }
    if (url.includes("groq")) {
      return jsonResponse({ data: [
        { id: "llama-3.3-70b-versatile" },
        { id: "groq/compound" },
        { id: "whisper-large-v3" },
      ] });
    }
    return jsonResponse({ data: [{ id: "anthropic/claude-opus-5" }] });
  };

  const results = await refreshProviderModelCatalogs(
    () => "test-key",
    { fetchFn, force: true, now: () => 1_000 },
  );

  assert.equal(results.every(({ status }) => status === "updated"), true);
  assert.deepEqual(getDiscoveredProviderModels("anthropic"), ["claude-opus-5"]);
  assert.deepEqual(getDiscoveredProviderModels("openai"), ["gpt-5.2"]);
  assert.deepEqual(getDiscoveredProviderModels("google"), ["gemini-3.6-flash"]);
  assert.deepEqual(getDiscoveredProviderModels("nvidia"), [
    "nvidia/meta/llama-4",
    "nvidia/nvidia/nemotron-chat",
  ]);
  assert.deepEqual(getDiscoveredProviderModels("github-models"), ["github/openai/gpt-4.1"]);
  assert.deepEqual(getDiscoveredProviderModels("groq"), [
    "groq/llama-3.3-70b-versatile",
    "groq/groq/compound",
  ]);
  assert.equal(
    resolveModelName("nvidia/nvidia/nemotron-chat", "nvidia"),
    "nvidia/nemotron-chat",
  );
  assert.equal(
    resolveModelName("groq/groq/compound", "groq"),
    "groq/compound",
  );
  assert.equal(getProviderModelRefreshStatus("groq"), "updated");

  const anthropic = listProviders().find(({ name }) => name === "anthropic");
  assert.deepEqual(anthropic?.models, ["claude-opus-5"]);
});

test("OpenAI discovery keeps chat fine-tunes but rejects non-chat endpoint models", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);

  const fetchFn: typeof fetch = async (input) => {
    if (String(input).includes("openai.com")) {
      return jsonResponse({ data: [
        { id: "gpt-5.2" },
        { id: "ft:gpt-5.2:org:audio-helper:run-1" },
        { id: "gpt-image-1" },
        { id: "gpt-realtime-mini" },
        { id: "gpt-4o-transcribe" },
        { id: "gpt-audio" },
        { id: "gpt-4o-mini-tts" },
        { id: "whisper-1" },
        { id: "text-embedding-3-small" },
        { id: "omni-moderation-latest" },
      ] });
    }
    return jsonResponse({ error: "unavailable" }, 503);
  };

  await refreshProviderModelCatalogs(
    (provider) => provider === "openai" ? "openai-test-key" : "",
    { fetchFn, force: true },
  );

  assert.deepEqual(getDiscoveredProviderModels("openai"), [
    "gpt-5.2",
    "ft:gpt-5.2:org:audio-helper:run-1",
  ]);
});

test("catalog refresh uses TTL cache and skips credentialed providers without keys", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);
  let requests = 0;
  const fetchFn: typeof fetch = async () => {
    requests++;
    return jsonResponse({ data: [{ id: "openrouter/test-model" }] });
  };

  const first = await refreshProviderModelCatalogs(
    () => "",
    { fetchFn, now: () => 5_000 },
  );
  assert.equal(first.filter(({ status }) => status === "skipped").length, 7);
  assert.equal(first.find(({ provider }) => provider === "openrouter")?.status, "updated");
  assert.equal(requests, 2);

  const second = await refreshProviderModelCatalogs(
    () => "",
    { fetchFn, now: () => 5_001 },
  );
  assert.equal(second.find(({ provider }) => provider === "openrouter")?.status, "cached");
  assert.equal(getProviderModelRefreshStatus("openrouter"), "cached");
  assert.equal(requests, 2);
});

test("failed discovery remains non-throwing without inventing selectable models", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);

  const results = await refreshProviderModelCatalogs(
    () => "test-key",
    {
      fetchFn: async () => jsonResponse({ error: "no" }, 503),
      force: true,
    },
  );

  assert.equal(results.every(({ status }) => status === "failed"), true);
  assert.equal(getDiscoveredProviderModels("anthropic"), undefined);
  assert.ok(
    (listProviders().find(({ name }) => name === "anthropic")?.models.length ?? 0) === 0,
  );
});

test("catalog discovery rejects redirects without forwarding credentials", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);

  const secret = "provider-secret-that-must-not-leak";
  const calls: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      redirect: init?.redirect,
    });
    return new Response("", {
      status: 302,
      headers: { location: "https://credential-thief.invalid/catalog" },
    });
  };

  const results = await refreshProviderModelCatalogs(
    () => secret,
    { fetchFn, force: true },
  );

  assert.equal(calls.length, 9);
  assert.equal(calls.every(({ redirect }) => redirect === "manual"), true);
  assert.equal(
    calls.some(({ url }) => url.includes("credential-thief.invalid")),
    false,
  );
  assert.equal(results.every(({ status }) => status === "failed"), true);
  for (const result of results) {
    assert.match(result.error ?? "", /redirect blocked/);
    assert.equal(result.error?.includes(secret), false);
    assert.equal(result.error?.includes("credential-thief.invalid"), false);
  }
});

 test("Ollama catalog follows the running server and drops stopped or deleted models", async () => {
  clearDiscoveredProviderModels();
  const fetchFn: typeof fetch = async url => String(url).includes("11434") ? jsonResponse({ models: [{ name: "fixture:latest" }] }) : jsonResponse({}, 503);
  await refreshProviderModelCatalogs(() => "", { fetchFn, force: true });
  assert.deepEqual(listProviders().find(p => p.name === "ollama")?.models, ["fixture:latest"]);
  await refreshProviderModelCatalogs(() => "", { fetchFn: async () => jsonResponse({}, 503), force: true });
  assert.deepEqual(listProviders().find(p => p.name === "ollama")?.models, []);
  clearDiscoveredProviderModels();
 });
