import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgent, resolveTurnLimit, type StreamFn } from "../src/agent-runner.js";
import { compactRequest } from "../src/runtime/request-context.js";
import { buildCLIConfig } from "../src/cli-bootstrap.js";
import type { CLIConfig, Message } from "../src/types.js";
const config: CLIConfig = { apiKey: "test", model: "fake", baseUrl: "http://localhost", maxTokens: 100, temperature: 0, permissionMode: "auto", contextChars: 12000 };

function assertPairs(messages: Message[]) {
  const pending = new Set<string>();
  for (const m of messages) {
    if (m.role !== "tool") assert.equal(pending.size, 0, "native batch must be complete before next message");
    for (const c of m.toolCalls ?? []) pending.add(c.id);
    if (m.role === "tool") assert.equal(pending.delete(m.toolCallId!), true, "orphan tool result");
  }
  assert.equal(pending.size, 0);
}
for (const limit of [undefined, 0]) test(`default unlimited completes 120 tool rounds with maxTurns=${limit}`, async () => {
  let calls = 0, compacted = false;
  const stream: StreamFn = async function* (messages) {
    assertPairs(messages);
    assert(messages.some((m) => m.content === "Keep the task intact"));
    assert(messages.some((m) => m.role === "system" && m.content.startsWith("SYSTEM RULE")));
    assert(messages.reduce((n, m) => n + JSON.stringify(m).length, 0) <= 12000);
    compacted ||= messages.some((m) => m.contextKind === "summary");
    if (calls++ < 120) yield { type: "tool_call", text: "", toolCall: { id: `call-${calls}`, name: "read", arguments: JSON.stringify({ filePath: `file-${calls}.txt` }) } };
    else yield { type: "content", text: "done after 120 tools" };
  };
  const result = await runAgent([{ role: "system", content: "SYSTEM RULE" }, { role: "user", content: "Keep the task intact" }], config, "/tmp", {
    maxTurns: limit, streamFn: stream, nativeToolExecFn: () => ({ tool: "read", result: "evidence ".repeat(400), success: true }),
  });
  assert.equal(result.turns, 121); assert.equal(result.toolCalls.length, 120);
  assert.equal(result.finalText, "done after 120 tools"); assert.equal(result.hitTurnLimit, false);
  assert(compacted); assert(result.messages!.length > 240); assertPairs(result.messages!);
});

test("explicit limits and invalid values", async () => {
  assert.equal(resolveTurnLimit(), Infinity); assert.equal(resolveTurnLimit(0), Infinity);
  for (const value of [-1, NaN, Infinity, 1.5]) assert.throws(() => resolveTurnLimit(value));
  let i = 0;
  const result = await runAgent([{ role: "user", content: "task" }], config, "/tmp", { maxTurns: 2,
    streamFn: async function* () { yield { type: "content", text: `<tool:read>file-${i++}.txt</tool>` }; },
    textToolExecFn: () => ({ tool: "read", result: "ok", success: true }) });
  assert.equal(result.turns, 2); assert.equal(result.hitTurnLimit, true);
  assert.equal(buildCLIConfig({ maxTurns: 0 }, {}, {}, () => "").config.maxTurns, 0);
  assert.equal(buildCLIConfig({}, {}, {}, () => "").config.autoKnowledge, true);
  assert.equal(buildCLIConfig({ autoKnowledge: false }, {}, {}, () => "").config.autoKnowledge, false);
});

test("unlimited run is cancellable after more than ten rounds", async () => {
  const controller = new AbortController(); let i = 0;
  const result = await runAgent([{ role: "user", content: "task" }], config, "/tmp", { signal: controller.signal,
    streamFn: async function* () { if (++i === 22) controller.abort(); yield { type: "content", text: `<tool:read>file-${i}.txt</tool>` }; },
    textToolExecFn: () => ({ tool: "read", result: "ok", success: true }) });
  assert(result.aborted); assert.equal(result.hitTurnLimit, false); assert.equal(i, 22);
});

test("compaction retains rules and corrections, never mutates original or splits native groups", () => {
  const messages: Message[] = [{ role: "system", content: "rule" }, { role: "user", content: "original task" }];
  for (let i = 0; i < 40; i++) messages.push({ role: "assistant", content: "", toolCalls: [{ id: `${i}`, name: "read", arguments: { path: `file-${i}` } }] }, { role: "tool", toolCallId: `${i}`, content: "x".repeat(900) });
  messages.push({ role: "user", content: "latest correction must survive" });
  const before = JSON.stringify(messages); const result = compactRequest(messages, 8000);
  assert.equal(JSON.stringify(messages), before); assert(result.removedMessages > 0); assertPairs(result.messages);
  for (const text of ["rule", "original task", "latest correction must survive"]) assert(result.messages.some((m) => m.content === text));
  assert(result.messages.reduce((n, m) => n + JSON.stringify(m).length, 0) <= 8000);
});

test("oversized tool batches become labelled excerpts; oversized task is not silently cut", () => {
  const messages: Message[] = [{ role: "user", content: "task" }, { role: "assistant", content: "", toolCalls: [{ id: "a", name: "write", arguments: { content: "x".repeat(20000) } }] }, { role: "tool", content: "written", toolCallId: "a" }];
  const result = compactRequest(messages, 4000); assertPairs(result.messages);
  assert(result.messages.some((m) => m.content.includes("written")));
  assert.throws(() => compactRequest([{ role: "user", content: "x".repeat(10000) }], 4000), /exceed/);
});

test("unchanging read loops stop but polling with changing results remains unlimited", async () => {
  const identical: StreamFn = async function* () { yield { type: "content", text: "<tool:read>state.txt</tool>" }; };
  const stuck = await runAgent([{ role: "user", content: "task" }], config, "/tmp", { streamFn: identical,
    textToolExecFn: () => ({ tool: "read", result: "unchanged", success: true }) });
  assert.equal(stuck.turns, 3); assert(stuck.loopDetected); assert(!stuck.hitTurnLimit);
  let calls = 0;
  const advancing = await runAgent([{ role: "user", content: "task" }], config, "/tmp", {
    streamFn: async function* () { yield { type: "content", text: calls === 20 ? "done" : "<tool:read>state.txt</tool>" }; },
    textToolExecFn: () => ({ tool: "read", result: `version ${++calls}`, success: true }) });
  assert.equal(advancing.turns, 21); assert(!advancing.loopDetected);
});
