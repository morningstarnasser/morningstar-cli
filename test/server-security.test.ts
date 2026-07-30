import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../src/server.js";
import type { CLIConfig } from "../src/types.js";

const cliConfig: CLIConfig = {
  apiKey: "",
  model: "test-model",
  baseUrl: "http://127.0.0.1",
  maxTokens: 32,
  temperature: 0,
  provider: "ollama",
};

test("HTTP server refuses public binds without authentication", async () => {
  await assert.rejects(
    startServer({
      port: 0,
      host: "0.0.0.0",
      cliConfig,
      corsEnabled: false,
    }),
    /non-loopback bind without an authToken/,
  );
});

test("HTTP server rejects wildcard CORS", async () => {
  await assert.rejects(
    startServer({
      port: 0,
      host: "127.0.0.1",
      cliConfig,
      corsEnabled: true,
      corsOrigin: "*",
    }),
    /corsOrigin must be an explicit origin/,
  );
});

test("HTTP server enforces a configured bearer token", async () => {
  const instance = await startServer({
    port: 0,
    host: "127.0.0.1",
    cliConfig,
    corsEnabled: false,
    authToken: "test-server-token",
  });

  try {
    const denied = await fetch(`${instance.url}/health`);
    assert.equal(denied.status, 401);

    const allowed = await fetch(`${instance.url}/health`, {
      headers: { Authorization: "Bearer test-server-token" },
    });
    assert.equal(allowed.status, 200);
  } finally {
    instance.close();
  }
});
