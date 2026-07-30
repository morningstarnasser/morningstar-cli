import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkMessage } from "../src/telegram/api.js";

test("short text stays one chunk", () => {
  assert.deepEqual(chunkMessage("hello"), ["hello"]);
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
