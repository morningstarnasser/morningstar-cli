import { test } from "node:test";
import assert from "node:assert/strict";
import { runSideQuestion } from "../src/side-question.js";
import type { Message } from "../src/types.js";
const config = { apiKey: "test", model: "fake", baseUrl: "http://localhost", maxTokens: 100, temperature: 0, permissionMode: "bypassPermissions" };
test("side question retains context without mutating the primary conversation", async () => {
  const messages: Message[] = [{ role: "user", content: "Main task" }];
  const before = structuredClone(messages);
  const result = await runSideQuestion(messages, "What does this mean?", config, "/tmp", { streamFn: async function* (context) { assert.equal(context.find(m => m.role === "user")?.content, "Main task"); yield { type: "content", text: "Explanation" }; } });
  assert.equal(result.finalText, "Explanation");
  assert.deepEqual(messages, before);
});
test("side question tool calls are denied even with bypass and a permissive injected callback", async () => {
  let executed = false;
  const result = await runSideQuestion([], "do it", config, "/tmp", { streamFn: async function* () { yield { type: "content", text: "<tool:bash>touch forbidden</tool:bash>" }; }, onApproval: async () => true, textToolExecFn: async () => { executed = true; return { tool: "bash", result: "bad", success: true }; } });
  assert.equal(executed, false);
  assert.equal(result.toolCalls[0].success, false);
});
