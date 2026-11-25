import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSwarmExecutor, runSwarm, prepareSwarmPlan, validateSwarmPlan, swarmTasksConflict, type SwarmTask } from "../src/swarm.js";
import type { StreamFn } from "../src/agent-runner.js";
import type { CLIConfig } from "../src/types.js";
import { getSessionCosts } from "../src/cost-tracker.js";

const config: CLIConfig = { apiKey: "fixture", model: "fixture", baseUrl: "http://localhost", provider: "fake", temperature: 0, maxTokens: 100, autoKnowledge: false, permissionMode: "acceptEdits" };
const task = (id: string, extra: Partial<SwarmTask> = {}): SwarmTask => ({ id, agentId: "code", description: `TASK_${id}`, dependsOn: [], writePaths: [], exclusive: false, ...extra });
const plan = (tasks: SwarmTask[], concurrency = 3) => ({ title: "Fixture", concurrency, tasks });
const workspace = () => mkdtempSync(join(tmpdir(), "morningstar-swarm-test-"));

test("validates IDs, roles, dependencies, concurrency, cycles and path boundaries before running", () => {
  const dir = workspace();
  try {
    for (const invalid of [plan([task("a"), task("a")]), plan([task("a", { dependsOn: ["missing"] })]), plan([task("a", { dependsOn: ["b"] }), task("b", { dependsOn: ["a"] })]), plan([task("a", { agentId: "not-real" })]), plan([task("a")], 0), plan([task("a")], 9), plan([task("a")], 1.1), plan([task("a", { writePaths: ["../escape"] })]), plan([task("a", { writePaths: ["/tmp"] })]), plan([task("a", { writePaths: ["src/*.ts"] })]), plan([task("a", { writePaths: [".git"] })])]) assert.throws(() => validateSwarmPlan(invalid, dir));
    const valid = validateSwarmPlan(plan([task("a"), task("b", { dependsOn: ["a"] })]), dir);
    assert.equal(valid.tasks.length, 2);
    assert.throws(() => validateSwarmPlan({ ...valid, title: "\x1b[?1000h" }, dir));
    assert.throws(() => validateSwarmPlan(plan([task("a", { description: "\x1b[31m" })]), dir));
    assert.throws(() => validateSwarmPlan(plan([task("a", { writePaths: ["a\x1b[31m"] })]), dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ownership blocks shell, unknown tools, traversal, sibling-prefix and symlink escapes", async () => {
  const dir = workspace(), outside = workspace(); let calls = 0;
  try {
    mkdirSync(join(dir, "src")); mkdirSync(join(dir, "other"));
    symlinkSync(outside, join(dir, "src/out"));
    symlinkSync(join(dir, "other"), join(dir, "src/link"));
    const exec = createSwarmExecutor(task("a", { writePaths: ["src"] }), dir, name => { calls++; return { tool: name, success: true, result: "ok" }; });
    for (const [name, args] of [["bash", { command: "touch other/no" }], ["mcp_server_tool", {}], ["gh", { command: "issue create" }], ["write", { filePath: "../no" }], ["edit", { filePath: "src2/no" }], ["delete", { filePath: "src/out/no" }], ["write", { filePath: "src/link/no" }], ["notebook_edit", { notebookPath: "other/no" }]] as const) assert.equal((await exec(name, args, dir)).success, false);
    assert.equal((await exec("write", { filePath: "src/yes.ts" }, dir)).success, true);
    assert.equal((await exec("read", { filePath: "other/read.ts" }, dir)).success, true);
    assert.equal(calls, 2);
    const ro = createSwarmExecutor(task("r"), dir, name => ({ tool: name, success: true, result: "ok" }));
    assert.equal((await ro("write", { filePath: "src/no" }, dir)).success, false);
    assert.throws(() => validateSwarmPlan(plan([task("a", { writePaths: ["src/out"] })]), dir));
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("ownership stays pinned if its root is replaced with a symlink", async () => {
  const dir = workspace();
  try {
    mkdirSync(join(dir, "src")); mkdirSync(join(dir, "other"));
    const exec = createSwarmExecutor(task("a", { writePaths: ["src"] }), dir, name => ({ tool: name, success: true, result: "ok" }));
    rmSync(join(dir, "src"), { recursive: true }); symlinkSync(join(dir, "other"), join(dir, "src"));
    assert.equal((await exec("write", { filePath: "src/no" }, dir)).success, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("conflicts cover nested ownership and symlink aliases, but not disjoint paths", () => {
  const dir = workspace();
  try {
    mkdirSync(join(dir, "src")); symlinkSync(join(dir, "src"), join(dir, "alias"));
    assert.equal(swarmTasksConflict(task("a", { writePaths: ["src"] }), task("b", { writePaths: ["src/sub"] }), dir), true);
    assert.equal(swarmTasksConflict(task("a", { writePaths: ["src"] }), task("b", { writePaths: ["alias"] }), dir), true);
    assert.equal(swarmTasksConflict(task("a", { writePaths: ["src/a"] }), task("b", { writePaths: ["src/b"] }), dir), false);
    assert.equal(swarmTasksConflict(task("a", { exclusive: true }), task("b"), dir), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("disjoint tasks overlap, concurrency is bounded, dependencies receive completed output", async () => {
  const dir = workspace(); let active = 0, peak = 0; const starts: string[] = [], ends: string[] = [];
  const streamFn: StreamFn = async function* (messages) {
    const prompt = messages.filter(m => m.role === "user").at(-1)!.content;
    const id = /TASK_(\w+)/.exec(prompt)![1];
    active++; peak = Math.max(peak, active); starts.push(id);
    if (id === "review") { assert.equal(ends.length, 3); assert.match(prompt, /DONE_a/); assert.match(prompt, /DONE_c/); }
    await new Promise(r => setTimeout(r, 25));
    yield { type: "content", text: `DONE_${id}` };
    active--; ends.push(id);
  };
  try {
    const results = await runSwarm(plan([task("a", { writePaths: ["a"] }), task("b", { writePaths: ["b"] }), task("c"), task("review", { dependsOn: ["a", "b", "c"] })], 2), config, dir, "system", undefined, undefined, { streamFn });
    assert.equal(peak, 2); assert.equal(starts.at(-1), "review");
    assert.ok(results.every(r => r.task.status === "completed"));
    assert.ok(results[0].messages.some(m => m.role === "assistant" && m.content.includes("DONE_a")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("overlapping writers and exclusive shell tasks never overlap", async () => {
  const dir = workspace(); let active = 0, peak = 0;
  const streamFn: StreamFn = async function* () { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 10)); yield { type: "content", text: "done" }; active--; };
  try {
    await runSwarm(plan([task("a", { writePaths: ["src"] }), task("b", { writePaths: ["src/a"] }), task("test", { exclusive: true })]), config, dir, "sys", undefined, undefined, { streamFn });
    assert.equal(peak, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("failed dependencies are skipped while independent work completes", async () => {
  const dir = workspace(); const started: string[] = [];
  const streamFn: StreamFn = async function* (messages) { const id = /TASK_(\w+)/.exec(messages.at(-1)!.content)![1]; started.push(id); if (id === "bad") throw new Error("fixture failure"); yield { type: "content", text: "done" }; };
  try {
    const results = await runSwarm(plan([task("bad"), task("good"), task("blocked", { dependsOn: ["bad"] })]), config, dir, "sys", undefined, undefined, { streamFn });
    assert.deepEqual(results.map(r => r.task.status), ["failed", "completed", "failed"]);
    assert.ok(!started.includes("blocked"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("abort cancels queued tasks without model calls", async () => {
  const dir = workspace(), ac = new AbortController(); ac.abort(); let calls = 0;
  const streamFn: StreamFn = async function* () { calls++; yield { type: "content", text: "no" }; };
  try {
    const results = await runSwarm(plan([task("a"), task("b")]), config, dir, "sys", ac.signal, undefined, { streamFn });
    assert.equal(calls, 0); assert.ok(results.every(r => r.task.status === "cancelled"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("abort reaches both active agents and cancels dependent work", async () => {
  const dir = workspace(), ac = new AbortController(); let calls = 0;
  const streamFn: StreamFn = async function* () {
    calls++;
    if (calls === 2) ac.abort();
    await new Promise(r => setTimeout(r, 15));
    yield { type: "content", text: "partial" };
  };
  try {
    const results = await runSwarm(plan([task("a"), task("b"), task("c", { dependsOn: ["a", "b"] })], 2), config, dir, "sys", ac.signal, undefined, { streamFn });
    assert.equal(calls, 2);
    assert.ok(results.every(r => r.task.status === "cancelled"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("parent plan mode and tool allowlist cannot be elevated by a scoped or exclusive task", async () => {
  const dir = workspace(); let executions = 0;
  const streamFn: StreamFn = async function* () { yield { type: "content", text: "<tool:write>owned/out.txt\nhello</tool>" }; };
  try {
    for (const cfg of [{ ...config, permissionMode: "plan" as const }, { ...config, toolAllowlist: ["read"] }]) {
      await runSwarm(plan([task("a", { writePaths: ["owned"] }), task("b", { exclusive: true })]), { ...cfg, maxTurns: 1 }, dir, "sys", undefined, undefined, {
        streamFn, nativeToolExecFn: name => { executions++; return { tool: name, success: true, result: "bad" }; },
      });
    }
    assert.equal(executions, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("swarm forwards approvals and enforces scope for text and native tools", async () => {
  const dir = workspace(); const events: string[] = []; let calls = 0, approvals = 0;
  const streamFn: StreamFn = async function* (messages) {
    if (messages.some(m => m.role === "tool" || m.role === "user" && m.content.includes("Tool-Ergebnisse"))) { yield { type: "content", text: "done" }; return; }
    yield { type: "content", text: '<tool:write>owned/out.txt\nhello</tool>' };
  };
  try {
    const results = await runSwarm(plan([task("a", { writePaths: ["owned"] })]), { ...config, permissionMode: "ask", maxTurns: 2 }, dir, "sys", undefined, undefined, {
      streamFn, onApproval: async () => { approvals++; return false; }, onTaskEvent: (_, e) => events.push(e.type), nativeToolExecFn: name => { calls++; return { tool: name, success: true, result: "ok" }; },
    });
    assert.ok(approvals > 0); assert.equal(calls, 0); assert.ok(events.includes("tool_requested")); assert.ok(events.includes("tool_result")); assert.equal(results.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("planner supports a validated local JSON file and model JSON without executing tools", async () => {
  const dir = workspace(); const raw = plan([task("a"), task("b", { dependsOn: ["a"] })]);
  try {
    writeFileSync(join(dir, "swarm.json"), JSON.stringify(raw));
    assert.equal((await prepareSwarmPlan("@swarm.json", config, dir, "sys")).tasks.length, 2);
    const streamFn: StreamFn = async function* () { yield { type: "content", text: '```json\n' + JSON.stringify(raw) + '\n```' }; };
    assert.equal((await prepareSwarmPlan("implement", config, dir, "sys", undefined, { streamFn })).tasks[1].dependsOn[0], "a");
    await assert.rejects(prepareSwarmPlan("@../outside", config, dir, "sys"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a shared budget stops the swarm and prevents dependent model requests", async () => {
  const dir = workspace(); let calls = 0;
  const streamFn: StreamFn = async function* () {
    calls++;
    yield { type: "usage", text: "", usage: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 } };
    yield { type: "content", text: "done" };
  };
  try {
    const results = await runSwarm(plan([task("a"), task("b", { dependsOn: ["a"] })]), { ...config, maxBudgetUsd: getSessionCosts().totalCost + 0.01 }, dir, "sys", undefined, undefined, { streamFn });
    assert.equal(calls, 1);
    assert.ok(results.every(r => r.task.status === "failed"));
    assert.match(results[1].task.error!, /Budget/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("planner recovers from empty and truncated JSON without executing any worker", async t => {
  const dir = workspace(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const valid = plan([task("a"), task("review", { dependsOn: ["a"] })]);
  let calls = 0;
  const streamFn: StreamFn = async function* (messages, _config, _signal, tools) {
    assert.equal(tools, false);
    calls++;
    if (calls === 1) { yield { type: "reasoning", text: "fixture private reasoning" }; return; }
    assert.match(messages.at(-1)!.content, /JSON/);
    if (calls === 2) { yield { type: "content", text: '{"tasks":[' }; return; }
    yield { type: "content", text: "Hier ist der Plan:\n```json\n" + JSON.stringify(valid) + "\n```" };
  };
  const result = await prepareSwarmPlan("review only", config, dir, "system", undefined, { streamFn });
  assert.equal(calls, 3); assert.equal(result.tasks[1].id, "review");
});

test("planner reports exhausted invalid output clearly and never fabricates a plan", async t => {
  const dir = workspace(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  let calls = 0;
  const streamFn: StreamFn = async function* () { calls++; yield { type: "content", text: "" }; };
  await assert.rejects(prepareSwarmPlan("work", config, dir, "sys", undefined, { streamFn }), /Swarm-Plan.*3.*leer/);
  assert.equal(calls, 3);
});

test("planner retries validation errors but does not retry aborts, budgets or invalid local files", async t => {
  const dir = workspace(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  let calls = 0;
  const streamFn: StreamFn = async function* () { calls++; yield { type: "content", text: JSON.stringify(plan([task("a", { agentId: calls === 1 ? "unknown" : "code" })])) }; };
  assert.equal((await prepareSwarmPlan("work", config, dir, "sys", undefined, { streamFn })).tasks[0].agentId, "code");
  assert.equal(calls, 2);
  const ac = new AbortController(); ac.abort();
  await assert.rejects(prepareSwarmPlan("work", config, dir, "sys", ac.signal, { streamFn }), /abgebrochen/);
  await assert.rejects(prepareSwarmPlan("work", { ...config, maxBudgetUsd: 0 }, dir, "sys", undefined, { streamFn }), /Budget/);
  writeFileSync(join(dir, "empty.json"), "");
  await assert.rejects(prepareSwarmPlan("@empty.json", config, dir, "sys", undefined, { streamFn }), /Swarm-Plan.*leer/);
  assert.equal(calls, 2);
});
