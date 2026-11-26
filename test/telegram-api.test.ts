import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkMessage } from "../src/telegram/api.js";

test("Telegram errors retain HTTP status and retry_after without leaking token or HTML bodies", async t => {
  const { TelegramClient } = await import("../src/telegram/api.js");
  const client = new TelegramClient("fixture-secret-token");
  let limited = false;
  t.mock.method(globalThis, "fetch", async () => limited
    ? Response.json({ ok: false, error_code: 429, description: "Retry https://example.test/fixture-secret-token", parameters: { retry_after: 37 } }, { status: 429 })
    : new Response("<html>upstream-private-details</html>", { status: 502 }));
  await assert.rejects(client.getMe(), (error: any) => error.status === 502 && !/upstream-private-details/.test(error.message));
  limited = true;
  await assert.rejects(client.getMe(), (error: any) => error.status === 429 && error.retryAfterSeconds === 37 && !/fixture-secret-token|example.test/.test(error.message));
});

test("short text stays one chunk", () => {
  assert.deepEqual(chunkMessage("hello"), ["hello"]);
});

test("malformed update batches cannot become offsets or channel input", async t => {
  const { TelegramClient } = await import("../src/telegram/api.js");
  const client = new TelegramClient("fixture"); let result: unknown;
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, result }));
  for (result of [null, {}, [null], [{ update_id: "9" }], [{ update_id: -1 }]]) await assert.rejects(client.getUpdates(91, 0), /gültige Update-Liste/);
  result = []; assert.deepEqual(await client.getUpdates(91, 0), []);
});

test("rich Telegram messages preserve threading, clear buttons and only fall back for entity errors", async t => {
  const { TelegramClient } = await import("../src/telegram/api.js"); const client = new TelegramClient("fixture");
  const bodies: any[] = []; let mode = "parse";
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body)); bodies.push(body);
    if (mode === "network") throw new Error("network");
    if (body.parse_mode && mode === "parse") return Response.json({ ok: false, error_code: 400, description: "can't parse entities" });
    if (mode === "unchanged") return Response.json({ ok: false, error_code: 400, description: "message is not modified" });
    return Response.json({ ok: true, result: { message_id: 77 } });
  });
  const page = { html: "<b>result</b>", text: "result" };
  assert.equal(await client.sendRichMessage(42, page, 12), 77);
  assert.equal(bodies.length, 2); assert.equal(bodies[1].parse_mode, undefined);
  assert.equal(bodies[1].reply_parameters.message_id, 12);
  mode = "ok"; assert.equal(await client.editRichMessage(42, 77, page), true);
  assert.deepEqual(bodies.at(-1).reply_markup.inline_keyboard, []);
  mode = "unchanged"; assert.equal(await client.editRichMessage(42, 77, page), true);
  mode = "network"; const count = bodies.length;
  await assert.rejects(client.sendRichMessage(42, page), /network/);
  assert.equal(bodies.length, count + 1);
  assert.equal(await client.editRichMessage(42, 77, page), false);
});

test("empty text yields no chunks", () => {
  assert.deepEqual(chunkMessage(""), []);
});

test("splits text longer than the limit into multiple chunks", () => {
  const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
  const chunks = chunkMessage(text, 40);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 40, `chunk too long: ${c.length}`);
  assert.equal(chunks.join("\n"), text);
});

test("hard-splits a single line longer than the limit", () => {
  const line = "x".repeat(100);
  const chunks = chunkMessage(line, 30);
  assert.equal(chunks.length, 4);
  for (const c of chunks) assert.ok(c.length <= 30);
  assert.equal(chunks.join(""), line);
});

test("prefers newline boundaries when possible", () => {
  const chunks = chunkMessage("aaaa\nbbbb\ncccc", 9);
  assert.deepEqual(chunks, ["aaaa\nbbbb", "cccc"]);
});

test("respects the default 4096 limit", () => {
  const big = "y".repeat(9000);
  const chunks = chunkMessage(big);
  assert.equal(chunks.length, 3);
  for (const c of chunks) assert.ok(c.length <= 4096);
});

test("attachment downloads reject traversal, enforce streamed byte limits and cancel the reader", async t => {
  const { TelegramClient } = await import("../src/telegram/api.js");
  const client = new TelegramClient("fixture"); let calls = 0, cancelled = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    calls++; assert.equal(options.redirect, "error");
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); }, cancel() { cancelled = true; } }));
  });
  for (const path of ["../secret", "/absolute", "https://example.test/a", "x/%2e%2e/a", "x/./a"]) await assert.rejects(client.downloadFile(path));
  assert.equal(calls, 0); await assert.rejects(client.downloadFile("photos/a.jpg", 4), /Grössenlimit/);
  assert.equal(cancelled, true);
});

test("Telegram long polling propagates cancellation and file replies use multipart and native threading", async t => {
  const { TelegramClient } = await import("../src/telegram/api.js"); const client = new TelegramClient("fixture");
  const abort = new AbortController(); abort.abort();
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    if (options.signal?.aborted) throw options.signal.reason;
    const form = options.body as FormData; assert.equal(form.get("chat_id"), "42");
    assert.equal(JSON.parse(String(form.get("reply_parameters"))).message_id, 12);
    assert.equal(await (form.get("document") as Blob).text(), "proof");
    return Response.json({ ok: true, result: { message_id: 77 } });
  });
  await assert.rejects(client.getUpdates(0, 25, abort.signal));
  assert.equal(await client.sendFile(42, "proof.txt", Buffer.from("proof"), false, 12), 77);
});
