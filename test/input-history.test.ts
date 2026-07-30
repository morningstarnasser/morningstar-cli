import { test } from "node:test";
import assert from "node:assert/strict";
import { isSensitiveInput } from "../src/input-history.js";

test("input history excludes common credential forms", () => {
  const secretInputs = [
    "--api-key sk-example-secret",
    "/config set apiKeys.google AIzaExampleCredentialValue123456789",
    "export DEEPSEEK_API_KEY=sk-example-secret",
    "TELEGRAM_BOT_TOKEN=123456789:AAExampleCredentialValue",
    "use hf_exampleCredential123 for this request",
    "gsk_exampleCredential123",
    "nvapi-exampleCredential123",
  ];

  for (const input of secretInputs) {
    assert.equal(isSensitiveInput(input), true, input);
  }
});

test("input history keeps ordinary coding prompts", () => {
  assert.equal(isSensitiveInput("review the API key loading code"), false);
  assert.equal(isSensitiveInput("/config"), false);
  assert.equal(isSensitiveInput("fix the authentication test"), false);
});
