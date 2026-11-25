import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRequestTools } from "../src/runtime/tool-discovery.js";
import { TOOL_DEFINITIONS, type OpenAIToolDefinition } from "../src/tool-definitions.js";
import { executeNativeToolCall, setAgentToolFilter } from "../src/tools.js";
import { decidePermission } from "../src/policy-engine.js";

const core = TOOL_DEFINITIONS.filter(t => t.function.name === "tool_search");
const definition = (name: string): OpenAIToolDefinition => ({ type: "function", function: { name, description: name + " " + "description ".repeat(100), parameters: { type: "object", properties: { accountId: { type: "string", enum: ["actual-account-id"] } }, required: ["accountId"], additionalProperties: false } } });
const large = [...core, ...Array.from({ length: 80 }, (_, i) => definition(`mcp__service__calendar_${i}`)), definition("mcp__service__vps_status")];

test("large local catalogs select relevant exact schemas without changing the permitted universe", () => {
  const selected = selectRequestTools(large, [{ role: "user", content: "gib mir vps status" }]);
  assert.deepEqual(selected.map(t => t.function.name), ["tool_search", "mcp__service__vps_status"]);
  assert.equal(selected[1], large.at(-1));
  assert.ok(JSON.stringify(selected).length <= 48000);
  assert.deepEqual(selectRequestTools(core, [{ role: "user", content: "vps status" }]), core);
});

test("a search makes matching tools available on the next turn and a new task resets discovery", () => {
  const messages = [{ role: "user" as const, content: "vps status" }, { role: "assistant" as const, content: "", toolCalls: [{ id: "one", name: "tool_search", arguments: { query: "calendar" } }] }];
  const selected = selectRequestTools(large, messages);
  assert.equal(selected.length, 9);
  assert.ok(selected.slice(1).every(t => t.function.name.includes("calendar")));
  assert.deepEqual(selectRequestTools(large, [...messages, { role: "user", content: "hello" }]), core);
});

test("discovery validates input and never bypasses an agent restriction or explicit policy denial", async t => {
  t.after(() => setAgentToolFilter(null));
  for (const query of [null, "", " ", 42, "x".repeat(501)]) assert.equal((await executeNativeToolCall("tool_search", { query }, process.cwd())).success, false);
  setAgentToolFilter(["read"]);
  assert.equal((await executeNativeToolCall("tool_search", { query: "vps" }, process.cwd())).success, false);
  assert.equal(decidePermission("tool_search", "vps", "plan").decision, "allow");
  assert.equal(decidePermission("tool_search", "vps", "bypassPermissions", [], ["tool_search"]).decision, "deny");
});
