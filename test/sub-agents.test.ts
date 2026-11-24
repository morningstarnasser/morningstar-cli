import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSubAgentToolExecutors,
  executeSubAgent,
  executeSubAgentPipeline,
  executeSubAgentsParallel,
} from "../src/sub-agents.js";
import type { StreamFn } from "../src/agent-runner.js";
import type { CLIConfig } from "../src/types.js";

const CONFIG: CLIConfig = {
  apiKey: "test",
  model: "fake",
  baseUrl: "http://localhost",
  maxTokens: 100,
  temperature: 0,
  provider: "fake",
  permissionMode: "ask",
};

test("per-agent executors enforce the same allowlist for text and native calls", async () => {
  const executions: string[] = [];
  const executors = createSubAgentToolExecutors(["read"], {
    textToolExecFn: async (call) => {
      executions.push(`text:${call.tool}`);
      return { tool: call.tool, result: "text ok", success: true };
    },
    nativeToolExecFn: async (name) => {
      executions.push(`native:${name}`);
      return { tool: name, result: "native ok", success: true };
    },
  });

  const allowedText = await executors.textToolExecFn(
    { tool: "READ", args: { filePath: "notes.txt" } },
    "/tmp",
  );
  const deniedText = await executors.textToolExecFn(
    { tool: "bash", args: { command: "echo no" } },
    "/tmp",
  );
  const allowedNative = await executors.nativeToolExecFn(
    "read",
    { filePath: "notes.txt" },
    "/tmp",
  );
  const deniedNative = await executors.nativeToolExecFn(
    "write",
    { filePath: "out.txt", content: "no" },
    "/tmp",
  );

  assert.equal(allowedText.success, true);
  assert.equal(allowedNative.success, true);
  assert.equal(deniedText.success, false);
  assert.equal(deniedNative.success, false);
  assert.match(deniedNative.result, /nicht erlaubt/);
  assert.deepEqual(executions, ["text:READ", "native:read"]);
});

test("executeSubAgent uses the canonical runner and threads approval, usage, and progress", async () => {
  const responses = [
    "<tool:write>out.txt\nvalue</tool>",
    "Fertig.",
  ];
  const streamFn: StreamFn = async function* () {
    yield { type: "content", text: responses.shift() ?? "" };
    yield {
      type: "usage",
      text: "",
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    };
  };
  const approvals: string[] = [];
  const progress: string[] = [];
  let executions = 0;

  const result = await executeSubAgent(
    "code",
    "write a file",
    CONFIG,
    "/tmp",
    "base prompt",
    undefined,
    3,
    (status) => progress.push(status),
    {
      streamFn,
      onApproval: async (request) => {
        approvals.push(request.invocation.name);
        return false;
      },
      textToolExecFn: async (call) => {
        executions++;
        return { tool: call.tool, result: "should not run", success: true };
      },
    },
  );

  assert.equal(result.task.status, "failed");
  assert.match(result.task.error!, /write fehlgeschlagen.*Permission denied/);
  assert.equal(result.fullResponse, "Fertig.");
  assert.equal(result.task.tokensUsed, 10);
  assert.deepEqual(result.task.toolsUsed, ["write"]);
  assert.deepEqual(approvals, ["write"]);
  assert.equal(executions, 0);
  assert.ok(progress.some((status) => status.includes("Turn 2/3")));
});


for (const run of [executeSubAgentPipeline, executeSubAgentsParallel]) test(`${run.name} does not restore a five-turn cap`, async () => {
  let turns = 0;
  const results = await run([{ agentId: "fixture-unknown-agent", description: "long task" }], CONFIG, "/tmp", "system", undefined, undefined, {
    streamFn: async function* () { yield { type: "content", text: ++turns > 20 ? "Finished long task" : `<tool:read>file-${turns}.txt</tool>` }; },
    textToolExecFn: () => ({ tool: "read", result: "evidence", success: true }),
  });
  assert.equal(turns, 21); assert.equal(results[0].task.status, "completed"); assert.equal(results[0].fullResponse, "Finished long task");
});

test("a delegated task inherits an explicit parent cap and reports it as incomplete", async () => {
  let turns = 0;
  const result = await executeSubAgent("fixture-unknown-agent", "task", { ...CONFIG, maxTurns: 2 }, "/tmp", "system", undefined, undefined, undefined, {
    streamFn: async function* () { yield { type: "content", text: `<tool:read>file-${++turns}.txt</tool>` }; },
    textToolExecFn: () => ({ tool: "read", result: "evidence", success: true }),
  });
  assert.equal(turns, 2); assert.equal(result.task.status, "failed"); assert.match(result.task.error!, /Turn-Limit/);
});
