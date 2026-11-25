import { test } from "node:test";
import assert from "node:assert/strict";
import { getProvider } from "../src/providers.js";
import type { CLIConfig } from "../src/types.js";

test("Ollama receives native schemas and preserves streamed tool calls; chat-only sends none", async t => {
  const config: CLIConfig = { provider: "ollama", model: "fixture", apiKey: "", baseUrl: "", maxTokens: 100, temperature: 0, toolAllowlist: ["read"] };
  const bodies: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    bodies.push(JSON.parse(String(options.body)));
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "read", arguments: '{"filePath":"status.json"}' } }] }, finish_reason: "tool_calls" }] }) + '\n\ndata: [DONE]\n\n');
  });
  const provider = getProvider(config), tokens = [];
  for await (const token of provider.streamChat([{ role: "user", content: "read status.json" }], config, undefined, true)) tokens.push(token);
  assert.deepEqual(bodies[0].tools?.map((tool: any) => tool.function.name), ["read"]);
  assert.equal(tokens.filter(token => token.type === "tool_call").length, 1);
  assert.equal(tokens.find(token => token.type === "tool_call")?.toolCall?.id, "call-1");
  for await (const _ of provider.streamChat([{ role: "user", content: "hello" }], config, undefined, false)) { /* consume */ }
  assert.equal(bodies[1].tools, undefined);
});
