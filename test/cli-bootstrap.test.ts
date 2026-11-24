import { getOllamaBaseUrl } from "../src/providers.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCLIConfig,
  buildModelSwitchConfig,
  createApiKeyHelpers,
} from "../src/cli-bootstrap.js";

test("selected model repairs a stale saved provider and base URL", () => {
  const result = buildCLIConfig(
    {},
    {
      model: "qwen3.5:27b-int4",
      provider: "removed-provider",
      baseUrl: "https://stale.invalid/v1",
    },
    {},
    () => "",
  );

  assert.equal(result.config.provider, "ollama");
  assert.equal(result.config.baseUrl, getOllamaBaseUrl());
  assert.equal(result.config.apiKey, "");
});

test("matching provider settings may retain an intentional compatible base URL", () => {
  const result = buildCLIConfig(
    {},
    {
      model: "gpt-4.1",
      provider: "openai",
      baseUrl: "http://localhost:9999/v1",
    },
    {},
    () => "test-key",
  );

  assert.equal(result.config.provider, "openai");
  assert.equal(result.config.baseUrl, "http://localhost:9999/v1");
  assert.equal(result.config.apiKey, "test-key");
});

test("saved OpenRouter ownership survives provider-shaped model ids", () => {
  const requestedProviders: string[] = [];
  const result = buildCLIConfig(
    {},
    {
      model: "nvidia/meta/llama-4",
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
    },
    {},
    (provider) => {
      requestedProviders.push(provider);
      return "openrouter-key";
    },
  );

  assert.equal(result.config.model, "nvidia/meta/llama-4");
  assert.equal(result.config.provider, "openrouter");
  assert.equal(result.config.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(result.config.apiKey, "openrouter-key");
  assert.deepEqual(requestedProviders, ["openrouter"]);
});

test("project OpenRouter ownership wins for its exact slash model", () => {
  const result = buildCLIConfig(
    {},
    {},
    {
      model: "groq/compound",
      provider: "openrouter",
    },
    () => "project-key",
  );

  assert.equal(result.config.provider, "openrouter");
  assert.equal(result.config.baseUrl, "https://openrouter.ai/api/v1");
});

test("provider switch replaces the previous provider credential", () => {
  const switched = buildModelSwitchConfig(
    {
      apiKey: "openai-secret",
      model: "gpt-5.2",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      maxTokens: 8_192,
      temperature: 0.6,
    },
    "claude-sonnet-5",
    "anthropic",
    (provider) => provider === "anthropic" ? "anthropic-secret" : "",
  );

  assert.equal(switched.provider, "anthropic");
  assert.equal(switched.model, "claude-sonnet-5");
  assert.equal(switched.baseUrl, "https://api.anthropic.com");
  assert.equal(switched.apiKey, "anthropic-secret");
  assert.notEqual(switched.apiKey, "openai-secret");
});

test("stored provider keys can be deleted and legacy keys do not reappear", () => {
  const writes: Array<Record<string, unknown>> = [];
  const saved: Record<string, unknown> = {
    provider: "anthropic",
    apiKey: "legacy-anthropic-secret",
    apiKeys: { openai: "openai-secret" },
  };
  const helpers = createApiKeyHelpers(saved, (data) => writes.push(data));

  assert.equal(helpers.getStoredApiKey("anthropic"), "legacy-anthropic-secret");
  assert.equal(saved.apiKey, "");
  helpers.storeApiKey("anthropic", "");

  const lastWrite = writes.at(-1);
  assert.deepEqual(lastWrite, {
    apiKeys: { openai: "openai-secret" },
    apiKey: "",
  });
});
