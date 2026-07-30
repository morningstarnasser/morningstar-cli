import { test } from "node:test";
import assert from "node:assert/strict";
import { trimHistory } from "../src/telegram/sessions.js";
import type { Message } from "../src/types.js";

function msgs(n: number): Message[] {
  return Array.from({ length: n }, (_, i) => ({ role: "user" as const, content: String(i) }));
}

test("returns a copy when under the limit", () => {
  const input = msgs(3);
  const out = trimHistory(input, 10);
  assert.deepEqual(out, input);
  assert.notEqual(out, input);
});

test("keeps the most recent N when over the limit", () => {
  const out = trimHistory(msgs(10), 4);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((m) => m.content), ["6", "7", "8", "9"]);
});

test("does not mutate the input", () => {
  const input = msgs(10);
  trimHistory(input, 2);
  assert.equal(input.length, 10);
});

test("limit of zero returns a full copy", () => {
  const input = msgs(3);
  assert.deepEqual(trimHistory(input, 0), input);
});
