import { test } from "node:test";
import assert from "node:assert/strict";
import type { Message } from "../src/types.js";
import {
  estimateTokens,
  needsCompaction,
  defaultSummary,
  compactMessages,
} from "../src/runtime/compaction.js";

const msg = (role: Message["role"], content: string): Message => ({ role, content });
function convo(n: number): Message[] {
  return Array.from({ length: n }, (_, i) =>
    msg(i % 2 === 0 ? "user" : "assistant", `message number ${i}`),
  );
}

test("estimateTokens approximates ~4 chars per token", () => {
  assert.equal(estimateTokens([msg("user", "abcd")]), 1);
  assert.equal(estimateTokens([msg("user", "a".repeat(40))]), 10);
});

test("needsCompaction triggers on message count", () => {
  assert.equal(needsCompaction(convo(10), { maxMessages: 40 }), false);
  assert.equal(needsCompaction(convo(50), { maxMessages: 40 }), true);
});

test("needsCompaction triggers on token estimate", () => {
  const big = [msg("user", "x".repeat(40000))]; // ~10k tokens
  assert.equal(needsCompaction(big, { maxTokens: 6000 }), true);
});

test("compactMessages is a no-op when under budget", async () => {
  const messages = convo(10);
  const r = await compactMessages(messages, { maxMessages: 40 });
  assert.equal(r.compacted, false);
  assert.equal(r.removedCount, 0);
  assert.deepEqual(r.messages, messages);
  assert.notEqual(r.messages, messages, "returns a new array (no mutation)");
});

test("compactMessages folds old messages into a summary and keeps recent tail", async () => {
  const messages = convo(50);
  const r = await compactMessages(messages, { maxMessages: 40, keepRecent: 12 });
  assert.equal(r.compacted, true);
  assert.equal(r.removedCount, 38);
  assert.equal(r.messages.length, 13, "1 summary + 12 recent");
  assert.ok(r.messages[0].content.startsWith("[Summary of earlier conversation]"));
  // The 12 most recent originals are preserved verbatim at the tail.
  assert.deepEqual(r.messages.slice(1), messages.slice(38));
  assert.ok(r.afterTokens < r.beforeTokens, "compaction reduces token estimate");
});

test("compactMessages uses an injected summarizer when provided", async () => {
  const messages = convo(50);
  const r = await compactMessages(messages, { maxMessages: 40 }, async () => "LLM SUMMARY");
  assert.equal(r.summary, "LLM SUMMARY");
  assert.ok(r.messages[0].content.includes("LLM SUMMARY"));
});

test("compactMessages never mutates the input", async () => {
  const messages = convo(50);
  const snapshot = JSON.stringify(messages);
  await compactMessages(messages, { maxMessages: 40 });
  assert.equal(JSON.stringify(messages), snapshot);
});

test("defaultSummary is deterministic and skips system messages", () => {
  const messages = [msg("system", "sys"), msg("user", "hello\nworld"), msg("assistant", "hi")];
  const a = defaultSummary(messages);
  const b = defaultSummary(messages);
  assert.equal(a, b);
  assert.ok(!a.includes("sys"));
  assert.ok(a.includes("user: hello"));
});
