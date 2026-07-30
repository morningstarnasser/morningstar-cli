import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runAgent,
  type AgentLifecycleEvent,
  type StreamFn,
  type ToolExecFn,
} from "../src/agent-runner.js";
import type { CLIConfig, Message, ToolResult } from "../src/types.js";
import type { StreamToken } from "../src/providers.js";

const CONFIG: CLIConfig = {
  apiKey: "test",
  model: "fake",
  baseUrl: "http://localhost",
  maxTokens: 100,
  temperature: 0,
  provider: "fake",
};

function fakeStream(responses: string[]): StreamFn {
  const queue = [...responses];
  return async function* (): AsyncGenerator<StreamToken> {
    const text = queue.shift() ?? "";
    yield { type: "content", text };
  };
}

const fakeToolExec: ToolExecFn = async (response: string) => {
  if (response.includes("RUNTOOL")) {
    const result: ToolResult = { tool: "bash", result: "ok", success: true };
    return { results: [result], cleanResponse: response.replace("RUNTOOL", "").trim() };
  }
  return { results: [], cleanResponse: response };
};

test("single prose turn returns final text and stops", async () => {
  const result = await runAgent([{ role: "user", content: "hi" }], CONFIG, "/tmp", {
    streamFn: fakeStream(["Hallo, fertig."]),
    toolExecFn: fakeToolExec,
  });
  assert.equal(result.finalText, "Hallo, fertig.");
  assert.equal(result.turns, 1);
  assert.equal(result.toolCalls.length, 0);
  assert.equal(result.aborted, false);
  assert.equal(result.hitTurnLimit, false);
});

test("runs tools then completes on the next turn", async () => {
  const result = await runAgent([{ role: "user", content: "do it" }], CONFIG, "/tmp", {
    streamFn: fakeStream(["RUNTOOL working on it", "Erledigt."]),
    toolExecFn: fakeToolExec,
  });
  assert.equal(result.turns, 2);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].tool, "bash");
  assert.equal(result.finalText, "Erledigt.");
});

test("respects maxTurns when the model keeps calling tools", async () => {
  const alwaysTool: StreamFn = async function* () {
    yield { type: "content", text: "RUNTOOL again" };
  };
  const result = await runAgent([{ role: "user", content: "loop" }], CONFIG, "/tmp", {
    streamFn: alwaysTool,
    toolExecFn: fakeToolExec,
    maxTurns: 3,
  });
  assert.equal(result.turns, 3);
  assert.equal(result.toolCalls.length, 3);
  assert.equal(result.hitTurnLimit, true);
});

test("aborts immediately when the signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runAgent([{ role: "user", content: "x" }], CONFIG, "/tmp", {
    streamFn: fakeStream(["should not run"]),
    toolExecFn: fakeToolExec,
    signal: controller.signal,
  });
  assert.equal(result.aborted, true);
  assert.equal(result.turns, 0);
});

test("does not mutate the input messages array", async () => {
  const input: Message[] = [{ role: "user", content: "hi" }];
  await runAgent(input, CONFIG, "/tmp", {
    streamFn: fakeStream(["RUNTOOL", "done"]),
    toolExecFn: fakeToolExec,
  });
  assert.equal(input.length, 1);
});

test("invokes streaming callbacks", async () => {
  const chunks: string[] = [];
  const tools: ToolResult[] = [];
  await runAgent([{ role: "user", content: "go" }], CONFIG, "/tmp", {
    streamFn: fakeStream(["RUNTOOL hi", "fin"]),
    toolExecFn: fakeToolExec,
    onContent: (d) => chunks.push(d),
    onTool: (t) => tools.push(t),
  });
  assert.ok(chunks.length >= 1);
  assert.equal(tools.length, 1);
});

test("enables provider-native tools and executes a native invocation", async () => {
  const enableTools: Array<boolean | undefined> = [];
  const streamFn: StreamFn = async function* (_messages, _config, _signal, enabled) {
    enableTools.push(enabled);
    yield {
      type: "tool_call",
      text: "",
      toolCall: {
        id: "call-1",
        name: "read",
        arguments: '{"filePath":"notes.txt"}',
      },
    };
    yield { type: "content", text: "checking" };
  };
  const nativeCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const result = await runAgent([{ role: "user", content: "read" }], CONFIG, "/tmp", {
    streamFn,
    maxTurns: 1,
    nativeToolExecFn: async (name, args) => {
      nativeCalls.push({ name, args });
      return { tool: name, result: "native ok", success: true };
    },
  });

  assert.deepEqual(enableTools, [true]);
  assert.deepEqual(nativeCalls, [{ name: "read", args: { filePath: "notes.txt" } }]);
  assert.equal(result.toolCalls[0].result, "native ok");
  assert.equal(result.hitTurnLimit, true);
});

test("can disable provider tool advertisement for chat-only runs", async () => {
  const enableTools: Array<boolean | undefined> = [];
  const streamFn: StreamFn = async function* (_messages, _config, _signal, enabled) {
    enableTools.push(enabled);
    yield { type: "content", text: "chat only" };
  };

  const result = await runAgent([{ role: "user", content: "chat" }], CONFIG, "/tmp", {
    streamFn,
    enableTools: false,
  });

  assert.deepEqual(enableTools, [false]);
  assert.equal(result.finalText, "chat only");
  assert.equal(result.toolCalls.length, 0);
});

test("handles native and text calls in the same turn", async () => {
  const executed: string[] = [];
  const streamFn: StreamFn = async function* () {
    yield { type: "content", text: "<tool:read>text.txt</tool>" };
    yield {
      type: "tool_call",
      text: "",
      toolCall: {
        id: "native-1",
        name: "ls",
        arguments: '{"dirPath":"."}',
      },
    };
  };

  const result = await runAgent([{ role: "user", content: "both" }], CONFIG, "/tmp", {
    streamFn,
    maxTurns: 1,
    textToolExecFn: async (call) => {
      executed.push(`text:${call.tool}`);
      return { tool: call.tool, result: "text ok", success: true };
    },
    nativeToolExecFn: async (name) => {
      executed.push(`native:${name}`);
      return { tool: name, result: "native ok", success: true };
    },
  });

  assert.deepEqual(executed, ["text:read", "native:ls"]);
  assert.equal(result.toolCalls.length, 2);
});

test("deduplicates the same native and text action within one turn", async () => {
  const executed: string[] = [];
  const streamFn: StreamFn = async function* () {
    yield { type: "content", text: "<tool:read>same.txt</tool>" };
    yield {
      type: "tool_call",
      text: "",
      toolCall: {
        id: "native-same",
        name: "read",
        arguments: '{"filePath":"same.txt"}',
      },
    };
  };

  const result = await runAgent(
    [{ role: "user", content: "read once" }],
    { ...CONFIG, permissionMode: "bypassPermissions" },
    "/tmp",
    {
      streamFn,
      maxTurns: 1,
      textToolExecFn: async (call) => {
        executed.push(`text:${call.tool}`);
        return { tool: call.tool, result: "text", success: true };
      },
      nativeToolExecFn: async (name) => {
        executed.push(`native:${name}`);
        return { tool: name, result: "native", success: true };
      },
    },
  );

  assert.deepEqual(executed, ["native:read"]);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].result, "native");
});

test("preserves distinct native call ids even when name and arguments match", async () => {
  const executed: string[] = [];
  const turns: Message[][] = [];
  let turn = 0;
  const streamFn: StreamFn = async function* (messages) {
    turns.push(messages);
    turn++;
    if (turn === 1) {
      for (const id of ["native-a", "native-b"]) {
        yield {
          type: "tool_call",
          text: "",
          toolCall: {
            id,
            name: "read",
            arguments: '{"filePath":"same.txt"}',
          },
        };
      }
      return;
    }
    yield { type: "content", text: "done" };
  };

  const result = await runAgent(
    [{ role: "user", content: "read twice" }],
    { ...CONFIG, permissionMode: "bypassPermissions" },
    "/tmp",
    {
      streamFn,
      nativeToolExecFn: async (name) => {
        executed.push(name);
        return { tool: name, result: `result-${executed.length}`, success: true };
      },
    },
  );

  assert.deepEqual(executed, ["read", "read"]);
  assert.equal(result.toolCalls.length, 2);
  const assistantTurn = turns[1].find((message) => message.role === "assistant");
  assert.deepEqual(
    assistantTurn?.toolCalls?.map(({ id }) => id),
    ["native-a", "native-b"],
  );
  assert.deepEqual(
    turns[1]
      .filter((message) => message.role === "tool")
      .map((message) => message.toolCallId),
    ["native-a", "native-b"],
  );
});

test("maps same-name text results to each invocation exactly once", async () => {
  const turns: Message[][] = [];
  let turn = 0;
  const streamFn: StreamFn = async function* (messages) {
    turns.push(messages);
    turn++;
    if (turn === 1) {
      yield {
        type: "content",
        text: "<tool:read>a.txt</tool><tool:read>b.txt</tool>",
      };
      return;
    }
    yield { type: "content", text: "done" };
  };

  const result = await runAgent(
    [{ role: "user", content: "read both" }],
    { ...CONFIG, permissionMode: "bypassPermissions" },
    "/tmp",
    {
      streamFn,
      textToolExecFn: async (call) => ({
        tool: call.tool,
        result: String(call.args.filePath),
        success: true,
      }),
    },
  );

  assert.equal(result.finalText, "done");
  const feedback = turns[1].at(-1)?.content ?? "";
  assert.equal(feedback.match(/a\.txt/g)?.length, 1);
  assert.equal(feedback.match(/b\.txt/g)?.length, 1);
});

test("deny and missing approval fail closed before the executor", async () => {
  let executions = 0;
  const events: AgentLifecycleEvent[] = [];
  const config = { ...CONFIG, permissionMode: "ask" };

  const result = await runAgent([{ role: "user", content: "write" }], config, "/tmp", {
    streamFn: fakeStream(["<tool:write>out.txt\nsecret</tool>", "denied"]),
    textToolExecFn: async (call) => {
      executions++;
      return { tool: call.tool, result: "should not happen", success: true };
    },
    onEvent: (event) => events.push(event),
  });

  assert.equal(executions, 0);
  assert.equal(result.toolCalls[0].success, false);
  assert.match(result.toolCalls[0].result, /no approval callback/i);
  const required = events.findIndex((event) => event.type === "approval_required");
  const decision = events.findIndex((event) => event.type === "approval_decision");
  const toolResult = events.findIndex((event) => event.type === "tool_result");
  assert.ok(required >= 0 && required < decision && decision < toolResult);
  const decisionEvent = events[decision];
  assert.equal(decisionEvent.type, "approval_decision");
  if (decisionEvent.type === "approval_decision") {
    assert.equal(decisionEvent.decision.source, "missing_callback");
    assert.equal(decisionEvent.decision.decision, "deny");
  }
});

test("ask approval resolves before execution", async () => {
  const order: string[] = [];
  const config = { ...CONFIG, permissionMode: "strict" };

  const result = await runAgent([{ role: "user", content: "read" }], config, "/tmp", {
    streamFn: fakeStream(["<tool:read>notes.txt</tool>", "done"]),
    onApproval: async () => {
      order.push("approval");
      return { approved: true, reason: "test approval" };
    },
    textToolExecFn: async (call) => {
      order.push("executor");
      return { tool: call.tool, result: "ok", success: true };
    },
  });

  assert.deepEqual(order, ["approval", "executor"]);
  assert.equal(result.toolCalls[0].success, true);
});

test("abort while approval is pending resolves promptly and never executes", async () => {
  const controller = new AbortController();
  let executions = 0;
  const config = { ...CONFIG, permissionMode: "ask" };

  const result = await runAgent([{ role: "user", content: "write" }], config, "/tmp", {
    signal: controller.signal,
    streamFn: fakeStream(["<tool:write>out.txt\nvalue</tool>"]),
    onApproval: () => {
      controller.abort();
      return new Promise<boolean>(() => {});
    },
    textToolExecFn: async (call) => {
      executions++;
      return { tool: call.tool, result: "wrote", success: true };
    },
  });

  assert.equal(result.aborted, true);
  assert.equal(executions, 0);
});

test("disallowed patterns override allowed patterns before execution", async () => {
  let executions = 0;
  const config: CLIConfig = {
    ...CONFIG,
    permissionMode: "bypassPermissions",
    allowedTools: ["write"],
    disallowedTools: ["write"],
  };

  const result = await runAgent([{ role: "user", content: "write" }], config, "/tmp", {
    streamFn: fakeStream(["<tool:write>out.txt\nvalue</tool>", "done"]),
    textToolExecFn: async (call) => {
      executions++;
      return { tool: call.tool, result: "wrote", success: true };
    },
  });

  assert.equal(executions, 0);
  assert.match(result.toolCalls[0].result, /explicitly disallowed/);
});

test("agent tool allowlist denies text-only tools before approval or execution", async () => {
  let approvals = 0;
  let executions = 0;
  const streamFn = fakeStream(["<tool:vault>search secrets</tool>", "done"]);

  const result = await runAgent([{ role: "user", content: "restricted" }], CONFIG, "/tmp", {
    streamFn,
    toolAllowlist: ["read"],
    onApproval: async () => {
      approvals++;
      return true;
    },
    textToolExecFn: async (call) => {
      executions++;
      return { tool: call.tool, result: "should not run", success: true };
    },
  });

  assert.equal(approvals, 0);
  assert.equal(executions, 0);
  assert.equal(result.toolCalls[0].success, false);
  assert.match(result.toolCalls[0].result, /outside the active agent allowlist/);
});

test("allowed patterns pre-approve an ask-mode mutation", async () => {
  let executions = 0;
  const config: CLIConfig = {
    ...CONFIG,
    permissionMode: "ask",
    allowedTools: ["write"],
  };

  const result = await runAgent([{ role: "user", content: "write" }], config, "/tmp", {
    streamFn: fakeStream(["<tool:write>out.txt\nvalue</tool>", "done"]),
    textToolExecFn: async (call) => {
      executions++;
      return { tool: call.tool, result: "wrote", success: true };
    },
  });

  assert.equal(executions, 1);
  assert.equal(result.toolCalls[0].success, true);
});

test("invalid native JSON becomes a failure and never reaches the executor", async () => {
  let executions = 0;
  const streamFn: StreamFn = async function* () {
    yield {
      type: "tool_call",
      text: "",
      toolCall: { id: "bad-json", name: "read", arguments: '{"filePath":' },
    };
  };

  const result = await runAgent([{ role: "user", content: "read" }], CONFIG, "/tmp", {
    streamFn,
    maxTurns: 1,
    nativeToolExecFn: async (name) => {
      executions++;
      return { tool: name, result: "bad", success: true };
    },
  });

  assert.equal(executions, 0);
  assert.equal(result.toolCalls[0].success, false);
  assert.match(result.toolCalls[0].result, /Invalid native tool arguments/);
});

test("legacy seam compatibility never pre-authorizes native mutations", async () => {
  let nativeExecutions = 0;
  const streamFn: StreamFn = async function* () {
    yield {
      type: "tool_call",
      text: "",
      toolCall: {
        id: "native-write",
        name: "write",
        arguments: '{"filePath":"out.txt","content":"value"}',
      },
    };
  };

  const result = await runAgent([{ role: "user", content: "write" }], CONFIG, "/tmp", {
    streamFn,
    maxTurns: 1,
    toolExecFn: fakeToolExec,
    nativeToolExecFn: async (name) => {
      nativeExecutions++;
      return { tool: name, result: "wrote", success: true };
    },
  });

  assert.equal(nativeExecutions, 0);
  assert.equal(result.toolCalls[0].success, false);
  assert.match(result.toolCalls[0].result, /no approval callback/i);
});

test("detects identical canonical tool batches before repeated execution", async () => {
  let executions = 0;
  const result = await runAgent([{ role: "user", content: "loop" }], {
    ...CONFIG,
    permissionMode: "bypassPermissions",
  }, "/tmp", {
    streamFn: fakeStream([
      "<tool:write>same.txt\nvalue</tool>",
      "<tool:write>same.txt\nvalue</tool>",
    ]),
    textToolExecFn: async (call) => {
      executions++;
      return { tool: call.tool, result: "ok", success: true };
    },
  });

  assert.equal(executions, 1);
  assert.equal(result.loopDetected, true);
  assert.equal(result.turns, 2);
  assert.match(result.toolCalls[1].result, /Loop detected/);
});

test("repeated polling and read calls are allowed to observe changing state", async () => {
  let executions = 0;
  const streamFn: StreamFn = async function* () {
    yield {
      type: "tool_call",
      text: "",
      toolCall: {
        id: `poll-${executions}`,
        name: "bg_status",
        arguments: '{"taskId":"bg-1"}',
      },
    };
  };
  const result = await runAgent([{ role: "user", content: "poll" }], {
    ...CONFIG,
    permissionMode: "bypassPermissions",
  }, "/tmp", {
    streamFn,
    maxTurns: 2,
    nativeToolExecFn: async (name) => {
      executions++;
      return { tool: name, result: executions === 1 ? "running" : "done", success: true };
    },
  });

  assert.equal(executions, 2);
  assert.equal(result.loopDetected, false);
});

test("aggregates usage and emits completion last", async () => {
  const events: AgentLifecycleEvent[] = [];
  const streamFn: StreamFn = async function* () {
    yield {
      type: "usage",
      text: "",
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    };
    yield { type: "content", text: "done" };
  };

  const result = await runAgent([{ role: "user", content: "usage" }], CONFIG, "/tmp", {
    streamFn,
    onEvent: (event) => events.push(event),
  });

  assert.deepEqual(result.usage, { inputTokens: 3, outputTokens: 2, totalTokens: 5 });
  assert.equal(events.at(-1)?.type, "completion");
});

test("retains native tool call ids and results for the provider continuation", async () => {
  const turns: Message[][] = [];
  let turn = 0;
  const streamFn: StreamFn = async function* (messages) {
    turns.push(messages);
    turn++;
    if (turn === 1) {
      yield {
        type: "tool_call",
        text: "",
        toolCall: {
          id: "call-read-7",
          name: "read",
          arguments: '{"filePath":"notes.txt"}',
        },
      };
      return;
    }
    yield { type: "content", text: "done" };
  };

  const result = await runAgent(
    [{ role: "user", content: "read it" }],
    { ...CONFIG, permissionMode: "bypassPermissions" },
    "/tmp",
    {
      streamFn,
      nativeToolExecFn: async (name) => ({
        tool: name,
        result: "file contents",
        success: true,
      }),
    },
  );

  assert.equal(result.finalText, "done");
  assert.equal(turns.length, 2);
  const continuation = turns[1];
  const assistant = continuation.find((message) => message.toolCalls?.length);
  const tool = continuation.find((message) => message.role === "tool");
  assert.equal(assistant?.toolCalls?.[0].id, "call-read-7");
  assert.equal(assistant?.toolCalls?.[0].name, "read");
  assert.equal(tool?.toolCallId, "call-read-7");
  assert.equal(tool?.content, "file contents");
});

test("enforces maxBudgetUsd inside the shared runner", async () => {
  let streamTurns = 0;
  const streamFn: StreamFn = async function* () {
    streamTurns++;
    yield {
      type: "usage",
      text: "",
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 0,
        totalTokens: 1_000_000,
      },
    };
    yield { type: "content", text: "must not continue" };
  };

  const result = await runAgent(
    [{ role: "user", content: "expensive" }],
    {
      ...CONFIG,
      model: "gpt-4.1",
      maxBudgetUsd: 0.5,
    },
    "/tmp",
    { streamFn, maxTurns: 4 },
  );

  assert.equal(streamTurns, 1);
  assert.equal(result.budgetExceeded, true);
  assert.equal(result.costUsd, 2);
  assert.equal(result.turns, 1);
});

test("charges unknown cloud models against maxBudgetUsd", async () => {
  const streamFn: StreamFn = async function* () {
    yield {
      type: "usage",
      text: "",
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 0,
        totalTokens: 1_000_000,
      },
    };
    yield { type: "content", text: "must stop at the budget" };
  };

  const result = await runAgent(
    [{ role: "user", content: "use a new paid model" }],
    {
      ...CONFIG,
      provider: "openai",
      model: "gpt-newly-discovered",
      maxBudgetUsd: 0.5,
    },
    "/tmp",
    { streamFn, maxTurns: 4 },
  );

  assert.equal(result.budgetExceeded, true);
  assert.equal(result.costUsd, 1);
  assert.equal(result.turns, 1);
});

test("does not charge arbitrary local models against maxBudgetUsd", async () => {
  const streamFn: StreamFn = async function* () {
    yield {
      type: "usage",
      text: "",
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
      },
    };
    yield { type: "content", text: "local completion" };
  };

  const result = await runAgent(
    [{ role: "user", content: "use my local model" }],
    {
      ...CONFIG,
      provider: "ollama",
      model: "custom-local-model:latest",
      maxBudgetUsd: 0.000_001,
    },
    "/tmp",
    { streamFn, maxTurns: 1 },
  );

  assert.equal(result.budgetExceeded, false);
  assert.equal(result.costUsd, 0);
  assert.equal(result.finalText, "local completion");
});
