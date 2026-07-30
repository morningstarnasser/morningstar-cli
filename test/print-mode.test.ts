import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toPrintStreamEvent,
  type PrintStreamEvent,
} from "../src/print-mode.js";
import type { AgentLifecycleEvent, AgentRunResult } from "../src/agent-runner.js";

test("stream-json keeps content and reasoning event compatibility", () => {
  assert.deepEqual(
    toPrintStreamEvent({ type: "content_delta", turn: 2, delta: "hello" }),
    { type: "content", turn: 2, text: "hello" },
  );
  assert.deepEqual(
    toPrintStreamEvent({ type: "reasoning_delta", turn: 2, delta: "think" }),
    { type: "reasoning", turn: 2, text: "think" },
  );
});

test("stream-json tool results have a stable serializable shape", () => {
  const event: AgentLifecycleEvent = {
    type: "tool_result",
    turn: 1,
    invocation: {
      id: "call-1",
      name: "read",
      args: { filePath: "a.txt" },
      source: "native",
    },
    result: { tool: "read", result: "contents", success: true },
  };

  const output = toPrintStreamEvent(event);
  assert.deepEqual(JSON.parse(JSON.stringify(output)), output);
  assert.deepEqual(output, {
    type: "tool",
    turn: 1,
    invocation: event.invocation,
    tool: "read",
    result: "contents",
    success: true,
  });
});

test("stream-json completion exposes terminal runner state and usage", () => {
  const result: AgentRunResult = {
    finalText: "done",
    turns: 2,
    toolCalls: [{ tool: "read", result: "ok", success: true }],
    usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    aborted: false,
    hitTurnLimit: false,
    loopDetected: false,
  };
  const output: PrintStreamEvent = toPrintStreamEvent({
    type: "completion",
    result,
  });

  assert.deepEqual(output, {
    type: "completion",
    result: "done",
    turns: 2,
    toolCount: 1,
    usage: result.usage,
    aborted: false,
    hitTurnLimit: false,
    loopDetected: false,
  });
});
