import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent, type AgentLifecycleEvent, type AgentRunOptions, type StreamFn } from "../src/agent-runner.js";
import { decidePermission } from "../src/policy-engine.js";
import { getOpenAIToolDefinitions, getAnthropicToolDefinitions, getGoogleToolDefinitions } from "../src/tool-definitions.js";
import { buildCLIConfig } from "../src/cli-bootstrap.js";
import { parseToolCalls } from "../src/tools.js";
import { toPrintStreamEvent } from "../src/print-mode.js";
import type { CLIConfig, Message } from "../src/types.js";

const config: CLIConfig = { apiKey: "fixture", model: "fixture", provider: "fake", baseUrl: "http://localhost", maxTokens: 1000, temperature: 0, autoKnowledge: false, permissionMode: "acceptEdits" };
const plan = { title: "Autonomous fixture", concurrency: 2, tasks: [
  { id: "a", agentId: "code", description: "TASK_a", writePaths: ["a.txt"] },
  { id: "b", agentId: "code", description: "TASK_b", writePaths: ["b.txt"] },
  { id: "review", agentId: "review", description: "TASK_review", dependsOn: ["a", "b"] },
] };
const input: Message[] = [{ role: "system", content: "Preserve project rules" }, { role: "user", content: "Implement two modules and review them" }];
const native = (name: string, args: unknown, id = "call") => ({ type: "tool_call" as const, text: "", toolCall: { id, name, arguments: JSON.stringify(args) } });

for (const mode of ["native", "text"] as const) test(`${mode} model starts a swarm autonomously, receives results and resumes`, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "morningstar-autonomous-test-"));
  let active = 0, peak = 0, parentCalls = 0; const events: AgentLifecycleEvent[] = [], executed: string[] = [];
  const streamFn: StreamFn = async function* (messages, cfg) {
    const worker = cfg.enableSwarm === false;
    assert.equal(getOpenAIToolDefinitions(cfg.toolAllowlist, cfg.enableSwarm).some(t => t.function.name === "swarm"), !worker);
    if (!worker) {
      parentCalls++;
      assert.match(messages[0].content, /kannst selbst/);
      if (parentCalls === 1) {
        if (mode === "native") yield native("swarm", plan);
        else yield { type: "content", text: `<tool:swarm>${JSON.stringify(plan)}</tool:swarm>` };
      } else {
        assert.match(JSON.stringify(messages), /REPORT_review/);
        yield { type: "content", text: "PARENT_SYNTHESIS" };
      }
      return;
    }
    const id = /TASK_(\w+)/.exec(messages.find(m => m.role === "user")!.content)![1];
    assert.match(messages[0].content, /Preserve project rules/);
    assert.match(messages[0].content, /Implement two modules/);
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    if (id === "review") assert.match(messages.find(m => m.role === "user")!.content, /REPORT_a[\s\S]*REPORT_b/);
    if (id !== "review" && !messages.some(m => m.role === "tool") && !messages.some(m => m.content.includes("WRITE_OK"))) {
      if (mode === "native") yield native("write", { filePath: `${id}.txt`, content: id });
      else yield { type: "content", text: `<tool:write>${id}.txt\n${id}</tool:write>` };
    } else yield { type: "content", text: `REPORT_${id}` };
    yield { type: "usage", text: "", usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } };
    active--;
  };
  try {
    const result = await runAgent(input, config, cwd, { streamFn, onEvent: event => events.push(event),
      nativeToolExecFn: (name, args) => { executed.push(`native:${args.filePath}`); return { tool: name, result: "WRITE_OK", success: true }; },
      textToolExecFn: call => { executed.push(`text:${call.args.filePath}`); return { tool: call.tool, result: "WRITE_OK", success: true }; },
    });
    assert.equal(parentCalls, 2); assert.equal(peak, 2); assert.equal(result.finalText, "PARENT_SYNTHESIS");
    assert.deepEqual(executed.sort(), [`${mode}:a.txt`, `${mode}:b.txt`]);
    assert.equal(result.toolCalls[0].tool, "swarm"); assert.equal(result.toolCalls[0].success, true);
    assert.equal(result.messages![0].content, input[0].content);
    assert.equal(result.delegatedUsage!.totalTokens, 25); assert.ok(result.delegatedCostUsd! > 0);
    assert.equal(result.costUsd, result.delegatedCostUsd);
    assert.ok(events.some(e => e.type === "swarm_activity"));
    assert.ok(events.some(e => e.type === "swarm_activity" && e.event.type === "content_delta"));
    assert.equal(events.filter(e => e.type === "swarm_start").length, 1);
    assert.ok(events.some(e => e.type === "swarm_end" && e.success));
    for (const event of events.filter(e => e.type.startsWith("swarm_"))) assert.equal(toPrintStreamEvent(event).type, event.type);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("capabilities are request-only and never grow resumed transcripts", async () => {
  const seen: string[] = [];
  const streamFn: StreamFn = async function* (messages) { seen.push(messages[0].content); yield { type: "content", text: "done" }; };
  const first = await runAgent(input, config, "/tmp", { streamFn });
  await runAgent([...first.messages!, { role: "user", content: "again" }], config, "/tmp", { streamFn });
  assert.equal(seen[0], seen[1]);
  assert.equal(seen[1].split("<morningstar-swarm>").length, 2);
  assert.deepEqual(first.messages!.slice(0, 2), input);
});

for (const boundary of ["disabled", "no-tools", "allowlist", "deny", "hook", "strict"] as const) test(`autonomous swarm respects ${boundary} before any child starts`, async () => {
  let children = 0; const cfg: CLIConfig = { ...config, maxTurns: 1 };
  const opts: AgentRunOptions = {
    streamFn: async function* (_, c) { if (c.enableSwarm === false && c.model === "worker") children++; yield native("swarm", plan); },
    onEvent: event => { if (event.type === "swarm_start") children++; },
  };
  if (boundary === "disabled") opts.enableSwarm = false;
  if (boundary === "no-tools") opts.enableTools = false;
  if (boundary === "allowlist") opts.toolAllowlist = ["read"];
  if (boundary === "deny") cfg.disallowedTools = ["swarm"];
  if (boundary === "hook") cfg.runtimeSettings = { trustedHooks: { PreToolUse: [{ command: "exit 2" }] } } as CLIConfig["runtimeSettings"];
  if (boundary === "strict") cfg.permissionMode = "strict";
  const result = await runAgent(input, cfg, "/tmp", opts);
  assert.equal(children, 0); assert.equal(result.toolCalls[0].success, false);
});

for (const mode of ["plan", "restricted", "ask"] as const) test(`workers cannot elevate parent ${mode} permissions`, async () => {
  let executed = 0, approvals = 0, parent = 0;
  const streamFn: StreamFn = async function* (messages, cfg) {
    if (cfg.enableSwarm !== false) {
      if (!parent++) yield native("swarm", { ...plan, tasks: [plan.tasks[0]] });
      else yield { type: "content", text: "parent finished" };
    } else if (messages.some(m => m.role === "tool")) yield { type: "content", text: "worker finished" };
    else yield native("write", { filePath: "a.txt", content: "denied" });
  };
  const result = await runAgent(input, { ...config, permissionMode: mode === "plan" ? "plan" : mode === "ask" ? "ask" : "acceptEdits" }, "/tmp", {
    streamFn, ...(mode === "restricted" ? { toolAllowlist: ["swarm", "read"] } : {}),
    onApproval: async request => { assert.equal(request.invocation.name, "write"); approvals++; return false; },
    nativeToolExecFn: name => { executed++; return { tool: name, result: "bad", success: true }; },
  });
  assert.equal(executed, 0); assert.equal(approvals, mode === "ask" ? 1 : 0);
  assert.equal(result.finalText, "parent finished");
  assert.equal(result.toolCalls[0].success, false);
  const report = JSON.parse(result.toolCalls[0].result);
  assert.equal(report.tasks[0].status, "failed");
  assert.match(report.tasks[0].error, /write fehlgeschlagen/);
});

test("a worker tool failure cannot be declared successful or unblock dependent tasks", async () => {
  let parents = 0, reviews = 0;
  const streamFn: StreamFn = async function* (messages, cfg) {
    if (cfg.enableSwarm !== false) {
      if (!parents++) yield native("swarm", { ...plan, tasks: [plan.tasks[0], { ...plan.tasks[2], dependsOn: ["a"] }] });
      else { assert.match(JSON.stringify(messages), /disk full/); yield { type: "content", text: "I will recover the failed work" }; }
    } else {
      if (messages.some(m => m.role === "user" && m.content.includes("TASK_review"))) reviews++;
      if (messages.some(m => m.role === "tool")) yield { type: "content", text: "I claim it is complete" };
      else yield native("write", { filePath: "a.txt", content: "work" });
    }
  };
  const result = await runAgent(input, config, "/tmp", { streamFn,
    nativeToolExecFn: name => ({ tool: name, success: false, result: "disk full" }),
  });
  assert.equal(reviews, 0);
  assert.equal(result.toolCalls[0].success, false);
  assert.deepEqual(JSON.parse(result.toolCalls[0].result).tasks.map((t: { status: string }) => t.status), ["failed", "failed"]);
  assert.equal(result.finalText, "I will recover the failed work");
});

test("workers cannot recursively create swarms, even with bypass mode and exclusive workspace", async () => {
  let parents = 0, starts = 0;
  const streamFn: StreamFn = async function* (messages, cfg) {
    if (cfg.enableSwarm !== false && parents++) { yield { type: "content", text: "done" }; return; }
    if (messages.some(m => m.role === "tool")) { yield { type: "content", text: "nested denied" }; return; }
    yield native("swarm", { ...plan, tasks: [{ ...plan.tasks[0], exclusive: true }] });
  };
  const result = await runAgent(input, { ...config, permissionMode: "bypassPermissions" }, "/tmp", {
    streamFn, onEvent: e => { if (e.type === "swarm_start") starts++; },
  });
  assert.equal(starts, 1); assert.equal(result.finalText, "done");
});

test("a malformed plan is returned to the parent, which can recover without stopping the run", async () => {
  let calls = 0;
  const streamFn: StreamFn = async function* (messages) {
    if (!calls++) yield native("swarm", { tasks: [{ id: "a", agentId: "missing", description: "no" }] });
    else { assert.match(JSON.stringify(messages), /Unbekannter Agent/); yield { type: "content", text: "I can proceed directly" }; }
  };
  const result = await runAgent(input, config, "/tmp", { streamFn });
  assert.equal(result.finalText, "I can proceed directly"); assert.equal(result.toolCalls[0].success, false);
});

test("budget spent by workers prevents another parent model request", async () => {
  let parents = 0;
  const streamFn: StreamFn = async function* (_, cfg) {
    if (cfg.enableSwarm !== false) { parents++; yield native("swarm", { ...plan, tasks: [plan.tasks[0]] }); }
    else yield { type: "usage", text: "", usage: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 } };
  };
  const result = await runAgent(input, { ...config, maxBudgetUsd: 0.1 }, "/tmp", { streamFn });
  assert.equal(parents, 1); assert.equal(result.budgetExceeded, true); assert.ok(result.costUsd >= 0.1);
});

test("parent cancellation reaches concurrent workers and ends the live team", async () => {
  const ac = new AbortController(); let workers = 0; const ends: boolean[] = [];
  const streamFn: StreamFn = async function* (_, cfg, signal) {
    if (cfg.enableSwarm !== false) { yield native("swarm", plan); return; }
    assert.equal(signal?.aborted, false);
    if (++workers === 2) ac.abort();
    await new Promise(r => setTimeout(r, 5));
    yield { type: "content", text: "partial" };
  };
  const result = await runAgent(input, config, "/tmp", { signal: ac.signal, streamFn,
    onEvent: e => { if (e.type === "swarm_end") ends.push(e.success); },
  });
  assert.equal(workers, 2); assert.equal(result.aborted, true); assert.deepEqual(ends, [false]);
});

test("swarm schema exists in all native formats and is hidden for workers or other allowlists", () => {
  assert.ok(getOpenAIToolDefinitions().some(t => t.function.name === "swarm"));
  assert.ok(getAnthropicToolDefinitions().some(t => t.name === "swarm"));
  assert.ok(getGoogleToolDefinitions()[0].functionDeclarations.some(t => t.name === "swarm"));
  assert.ok(!getOpenAIToolDefinitions(undefined, false).some(t => t.function.name === "swarm"));
  assert.deepEqual(getOpenAIToolDefinitions(["read"]).map(t => t.function.name), ["read"]);
  assert.deepEqual(getOpenAIToolDefinitions([]), []);
  assert.equal(parseToolCalls('<tool:swarm>{"title":"x","tasks":[]}</tool:swarm>').calls[0].args.title, "x");
  assert.match(parseToolCalls('<tool:swarm>invalid</tool:swarm>').calls[0].error!, /JSON/);
  assert.equal(decidePermission("swarm", "", "auto").decision, "allow");
  assert.equal(decidePermission("swarm", "", "strict").decision, "ask");
  assert.equal(decidePermission("swarm", "", "auto", [], ["swarm"]).decision, "deny");
});


test("--yolo is a run-local bypass alias inherited by swarm workers", async () => {
  const built = buildCLIConfig({ yolo: true }, {}, {}, () => "");
  assert.equal(built.skipPermissions, true);
  assert.equal(built.config.yolo, true);
  assert.equal(built.config.dangerouslySkipPermissions, true);
  assert.equal(buildCLIConfig({}, {}, {}, () => "").config.yolo, false);
  assert.throws(() => buildCLIConfig({ yolo: true }, {}, { permissions: { disableBypassPermissionsMode: "disable" } }, () => ""), /disabled/);
  let parents = 0, approvals = 0, writes = 0;
  const streamFn: StreamFn = async function* (messages, cfg) {
    if (cfg.enableSwarm !== false) {
      if (!parents++) yield native("swarm", { ...plan, tasks: [plan.tasks[0]] });
      else yield { type: "content", text: "done" };
    } else if (messages.some(m => m.role === "tool")) yield { type: "content", text: "written" };
    else {
      assert.equal(cfg.dangerouslySkipPermissions, true);
      yield native("write", { filePath: "a.txt", content: "ok" });
    }
  };
  const result = await runAgent(input, { ...config, yolo: true, dangerouslySkipPermissions: true, permissionMode: "ask" }, "/tmp", {
    streamFn, onApproval: async () => { approvals++; return false; },
    nativeToolExecFn: name => { writes++; return { tool: name, result: "ok", success: true }; },
  });
  assert.equal(writes, 1); assert.equal(approvals, 0); assert.equal(result.finalText, "done");
});

test("solution-oriented guidance also reaches chat-only requests without enabling tools", async () => {
  const streamFn: StreamFn = async function* (messages, cfg, _, enableTools) {
    assert.match(messages[0].content, /Greife Nutzeranfragen grundsätzlich auf/);
    assert.match(messages[0].content, /Behaupte niemals/);
    assert.equal(enableTools, false); assert.equal(cfg.enableSwarm, false);
    yield { type: "content", text: "helpful answer" };
  };
  const result = await runAgent(input, config, "/tmp", { streamFn, enableTools: false });
  assert.equal(result.messages![0].content, input[0].content);
});

test("a worker protocol failure is not reported as completed", async () => {
  let parents = 0;
  const streamFn: StreamFn = async function* (_, cfg) {
    if (cfg.enableSwarm !== false) {
      if (!parents++) yield native("swarm", { ...plan, tasks: [plan.tasks[0]] });
      else yield { type: "content", text: "Werkzeugprotokoll fehlgeschlagen." };
    } else yield { type: "content", text: '<tool:mcp__missing>{"entity":"vps"}' };
  };
  const result = await runAgent(input, config, "/tmp", { streamFn });
  assert.equal(result.toolCalls[0].success, false);
  const report = JSON.parse(result.toolCalls[0].result);
  assert.equal(report.tasks[0].status, "failed");
  assert.match(report.tasks[0].error, /unvollständigen Aufruf/);
});
