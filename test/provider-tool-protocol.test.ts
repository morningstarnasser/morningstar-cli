import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serializeAnthropicMessages,
  serializeGeminiMessages,
  serializeOpenAIMessages,
} from "../src/providers.js";
import type { Message } from "../src/types.js";

const NATIVE_TURN: Message[] = [
  { role: "system", content: "system" },
  { role: "user", content: "read notes" },
  {
    role: "assistant",
    content: "",
    toolCalls: [{
      id: "call-42",
      name: "read",
      arguments: { filePath: "notes.txt" },
    }],
  },
  {
    role: "tool",
    content: "hello",
    toolCallId: "call-42",
    toolName: "read",
  },
];

test("OpenAI continuation retains tool_call_id", () => {
  const serialized = serializeOpenAIMessages(NATIVE_TURN);
  assert.deepEqual(serialized[2], {
    role: "assistant",
    content: null,
    tool_calls: [{
      id: "call-42",
      type: "function",
      function: {
        name: "read",
        arguments: '{"filePath":"notes.txt"}',
      },
    }],
  });
  assert.equal(serialized[3].tool_call_id, "call-42");
});

test("Anthropic continuation uses matching tool_use/tool_result blocks", () => {
  const serialized = serializeAnthropicMessages(NATIVE_TURN);
  assert.deepEqual(serialized[1].content[0], {
    type: "tool_use",
    id: "call-42",
    name: "read",
    input: { filePath: "notes.txt" },
  });
  assert.deepEqual(serialized[2].content[0], {
    type: "tool_result",
    tool_use_id: "call-42",
    content: "hello",
    is_error: false,
  });
});

test("Gemini continuation uses functionCall/functionResponse parts", () => {
  const serialized = serializeGeminiMessages(NATIVE_TURN);
  assert.deepEqual(serialized[1].parts[0], {
    functionCall: {
      name: "read",
      args: { filePath: "notes.txt" },
    },
  });
  assert.deepEqual(serialized[2].parts[0], {
    functionResponse: {
      name: "read",
      response: { result: "hello", success: true },
    },
  });
});
