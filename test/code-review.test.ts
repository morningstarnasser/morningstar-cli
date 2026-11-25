import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCodeReview, reviewSnapshot } from "../src/code-review.js";
import type { StreamFn } from "../src/agent-runner.js";

test("review forces read-only policy even for yolo parents and cannot spawn workers or execute shell", async t => {
  const cwd = mkdtempSync(join(tmpdir(), "morningstar-review-")); t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const executed: string[] = [];
  const stream: StreamFn = async function* (messages, cfg) {
    assert.equal(cfg.permissionMode, "plan"); assert.equal(cfg.enableSwarm, false);
    if (messages.some(m => m.role === "tool")) { yield { type: "content", text: "No verified issues" }; return; }
    for (const [id, name, args] of [["1", "write", { filePath: "unsafe.txt", content: "bad" }], ["2", "bash", { command: "touch unsafe" }], ["3", "git", { command: "reset --hard" }], ["4", "read", { filePath: "safe.txt" }], ["5", "swarm", { tasks: [] }]] as const) {
      yield { type: "tool_call", text: "", toolCall: { id, name, arguments: JSON.stringify(args) } };
    }
  };
  const result = await runCodeReview("security", { apiKey: "", model: "fixture", provider: "ollama", baseUrl: "http://localhost", maxTokens: 400, temperature: 0, permissionMode: "bypassPermissions", dangerouslySkipPermissions: true, yolo: true }, cwd,
    { streamFn: stream, nativeToolExecFn: name => { executed.push(name); return { tool: name, result: "file evidence", success: true }; } });
  assert.deepEqual(executed, ["read"]); assert.equal(result.toolCalls.filter(r => !r.success).length, 4); assert.match(result.finalText, /No verified issues/);
});

test("review reads staged and unstaged diffs through native and text git calls", async t => {
  const cwd = mkdtempSync(join(tmpdir(), "morningstar-review-diff-")); t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
  git("init"); writeFileSync(join(cwd, "tracked.txt"), "original\n"); git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture");
  writeFileSync(join(cwd, "tracked.txt"), "staged change\n"); git("add", "."); writeFileSync(join(cwd, "tracked.txt"), "unstaged change\n"); writeFileSync(join(cwd, "new.txt"), "new file\n");
  const snapshot = reviewSnapshot(cwd); assert.match(snapshot, /staged change/); assert.match(snapshot, /unstaged change/); assert.match(snapshot, /new.txt/);
  for (const native of [true, false]) {
    let calls = 0;
    const stream: StreamFn = async function* (messages) {
      if (calls++) { assert.match(JSON.stringify(messages), /unstaged change/); yield { type: "content", text: "Reviewed both diffs" }; return; }
      if (native) yield { type: "tool_call", text: "", toolCall: { id: "git", name: "git", arguments: "{}" } };
      else yield { type: "content", text: "<tool:git></tool>" };
    };
    const result = await runCodeReview("", { apiKey: "", model: "fixture", baseUrl: "", temperature: 0, maxTokens: 400 }, cwd, { streamFn: stream });
    assert.equal(result.toolCalls[0].success, true); assert.match(result.finalText, /both diffs/);
  }
});
