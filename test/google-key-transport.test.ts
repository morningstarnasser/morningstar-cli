import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { getProvider } from "../src/providers.js";
import type { CLIConfig } from "../src/types.js";

test("Gemini streaming sends its API key in a header, never in the URL", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const apiKey = "google-stream-secret";
  let requestUrl = "";
  let requestHeaders = new Headers();
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    return new Response(
      'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  };

  const config: CLIConfig = {
    apiKey,
    model: "gemini-test",
    baseUrl: "https://generativelanguage.googleapis.com",
    maxTokens: 128,
    temperature: 0,
    provider: "google",
  };

  const tokens = [];
  for await (const token of getProvider(config).streamChat(
    [{ role: "user", content: "hello" }],
    config,
  )) {
    tokens.push(token);
  }

  assert.equal(requestUrl.includes(apiKey), false);
  assert.equal(new URL(requestUrl).searchParams.get("key"), null);
  assert.equal(new URL(requestUrl).searchParams.get("alt"), "sse");
  assert.equal(requestHeaders.get("x-goog-api-key"), apiKey);
  assert.equal(tokens.at(0)?.text, "ok");
});

test("Gemini streaming blocks redirects without forwarding its API key", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const apiKey = "google-stream-redirect-secret";
  const calls: Array<{
    url: string;
    redirect: RequestRedirect | undefined;
    apiKey: string | null;
  }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      redirect: init?.redirect,
      apiKey: new Headers(init?.headers).get("x-goog-api-key"),
    });
    return new Response("", {
      status: 302,
      headers: { location: "https://credential-thief.invalid/collect" },
    });
  };

  const config: CLIConfig = {
    apiKey,
    model: "gemini-test",
    baseUrl: "https://generativelanguage.googleapis.com",
    maxTokens: 128,
    temperature: 0,
    provider: "google",
  };

  await assert.rejects(async () => {
    for await (const _token of getProvider(config).streamChat(
      [{ role: "user", content: "hello" }],
      config,
    )) {
      // The redirect must be rejected before any stream tokens are emitted.
    }
  }, /redirect blocked/i);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.redirect, "manual");
  assert.equal(calls[0]?.apiKey, apiKey);
  assert.equal(calls[0]?.url.includes("credential-thief.invalid"), false);
});

test("Gemini image API key transport", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalHome = process.env.HOME;
  const originalProfile = process.env.USERPROFILE;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const temporaryHome = mkdtempSync(join(tmpdir(), "morningstar-google-key-"));

  process.env.HOME = temporaryHome;
  process.env.USERPROFILE = temporaryHome;
  process.env.GOOGLE_API_KEY = "google-image-secret";
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = originalGoogleKey;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    rmSync(temporaryHome, { recursive: true, force: true });
  });

  const { generateImage } = await import("../src/image-gen.js");

  await t.test("sends its API key in a header, never in the URL", async () => {
    let requestUrl = "";
    let requestHeaders = new Headers();
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                mimeType: "image/png",
                data: Buffer.from("test-image").toString("base64"),
              },
            }],
          },
        }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await generateImage("header transport regression", { model: "gemini" });

    assert.equal(requestUrl.includes(process.env.GOOGLE_API_KEY), false);
    assert.equal(new URL(requestUrl).searchParams.get("key"), null);
    assert.equal(requestHeaders.get("x-goog-api-key"), process.env.GOOGLE_API_KEY);
    assert.equal(readFileSync(result.path, "utf8"), "test-image");
  });

  await t.test("blocks redirects without forwarding its API key", async () => {
    const redirectCalls: Array<{
      url: string;
      redirect: RequestRedirect | undefined;
      apiKey: string | null;
    }> = [];
    globalThis.fetch = async (input, init) => {
      redirectCalls.push({
        url: String(input),
        redirect: init?.redirect,
        apiKey: new Headers(init?.headers).get("x-goog-api-key"),
      });
      return new Response("", {
        status: 307,
        headers: { location: "https://credential-thief.invalid/collect" },
      });
    };

    await assert.rejects(
      generateImage("redirect transport regression", { model: "gemini" }),
      /Image Generation nicht eingerichtet/,
    );
    assert.equal(redirectCalls.length, 1);
    assert.equal(redirectCalls[0]?.redirect, "manual");
    assert.equal(redirectCalls[0]?.apiKey, process.env.GOOGLE_API_KEY);
    assert.equal(
      redirectCalls[0]?.url.includes("credential-thief.invalid"),
      false,
    );
  });
});
