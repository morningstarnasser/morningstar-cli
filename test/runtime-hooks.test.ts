import { tmpdir } from "node:os";
import { realpathSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runRuntimeHooks, validateHooks } from "../src/runtime-hooks.js";
import { runAgent, type StreamFn } from "../src/agent-runner.js";
const config = { apiKey: "test", model: "fake", baseUrl: "http://localhost", maxTokens: 100, temperature: 0, permissionMode: "auto" };
const stream: StreamFn = async function* () { yield { type: "content", text: '<tool:bash>echo hello</tool:bash>' }; };
test("exit 2 hook blocks, matcher is canonical Bash, cwd and JSON input are delivered", async () => {
  const hooks = { PreToolUse: [{ matcher: "^Bash$", hooks: [{ type: "command" as const, command: "cat >/dev/null; echo blocked >&2; exit 2" }] }] };
  validateHooks(hooks);
  const result = await runRuntimeHooks(hooks, "PreToolUse", { cwd: tmpdir(), tool_name: "bash", tool_input: { command: "echo hello" } });
  assert.equal(result.allowed, false);
  assert.match(result.messages.join(""), /blocked/);
  assert.equal((await runRuntimeHooks(hooks, "PreToolUse", { cwd: tmpdir(), tool_name: "read" })).allowed, true);
});
test("hook stdin follows documented shape and runs in project directory", async () => {
  const hook = { UserPromptSubmit: [{ command: "node -e 'let s=\"\"; process.stdin.on(\"data\",x=>s+=x); process.stdin.on(\"end\",()=>{const p=JSON.parse(s); console.log(p.hook_event_name+\":\"+p.prompt+\":\"+process.cwd())})'" }] };
  const result = await runRuntimeHooks(hook, "UserPromptSubmit", { cwd: tmpdir(), prompt: "hello" });
  assert.equal(result.allowed, true);
  assert.equal(result.messages[0], `UserPromptSubmit:hello:${realpathSync(tmpdir())}`);
});
test("hook JSON denial and changed input fail closed", async () => {
  for (const response of [{ hookSpecificOutput: { permissionDecision: "deny" } }, { hookSpecificOutput: { updatedInput: { command: "touch other" } } }, { continue: false }]) {
    const result = await runRuntimeHooks({ PreToolUse: [{ command: `printf '%s' '${JSON.stringify(response)}'` }] }, "PreToolUse", { cwd: tmpdir() });
    assert.equal(result.allowed, false);
  }
});
test("shared runner never executes an authorized tool blocked by a hook", async () => {
  let calls = 0;
  const result = await runAgent([{ role: "user", content: "test" }], { ...config, allowedTools: ["Bash"], runtimeSettings: { trustedHooks: { PreToolUse: [{ command: "exit 2" }] } } }, tmpdir(), { maxTurns: 1, streamFn: stream, textToolExecFn: async () => { calls++; return { tool: "bash", result: "bad", success: true }; } });
  assert.equal(calls, 0);
  assert.equal(result.toolCalls[0].success, false);
});
test("a tool deny is authoritative even if a hook could grant it", async () => {
  let calls = 0;
  const result = await runAgent([{ role: "user", content: "test" }], { ...config, disallowedTools: ["Bash"], runtimeSettings: { trustedHooks: { PreToolUse: [{ command: "echo hook-should-not-run; exit 2" }] } } }, tmpdir(), { maxTurns: 1, streamFn: stream, textToolExecFn: async () => { calls++; return { tool: "bash", result: "bad", success: true }; } });
  assert.equal(calls, 0);
  assert.doesNotMatch(result.toolCalls[0].result, /hook-should-not-run/);
});
test("disabled tools cannot execute hallucinated text calls", async () => {
  let calls = 0;
  const result = await runAgent([{ role: "user", content: "test" }], { ...config, permissionMode: "bypassPermissions" }, tmpdir(), { maxTurns: 1, enableTools: false, streamFn: stream, textToolExecFn: async () => { calls++; return { tool: "bash", result: "bad", success: true }; } });
  assert.equal(calls, 0);
  assert.equal(result.toolCalls[0].success, false);
});
test("post-tool hook context preserves exactly one native tool result per call id", async () => {
  let turn = 0;
  let seen: import("../src/types.js").Message[] = [];
  await runAgent([{ role: "user", content: "test" }], { ...config, allowedTools: ["Read"], runtimeSettings: { trustedHooks: { PostToolUse: [{ command: "echo additional-context" }] } } }, tmpdir(), {
    maxTurns: 2,
    streamFn: async function* (messages) {
      if (turn++ === 0) yield { type: "tool_call", toolCall: { id: "native1", name: "read", arguments: '{"filePath":"example"}' } };
      else { seen = [...messages]; yield { type: "content", text: "done" }; }
    },
    nativeToolExecFn: async () => ({ tool: "read", result: "file content", success: true }),
  });
  const results = seen.filter((m) => m.role === "tool" && m.toolCallId === "native1");
  assert.equal(results.length, 1);
  assert.match(results[0].content, /additional-context/);
});
