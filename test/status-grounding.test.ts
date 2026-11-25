import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgent, type StreamFn } from "../src/agent-runner.js";
import type { CLIConfig, ToolResult } from "../src/types.js";

const config: CLIConfig = { provider: "ollama", model: "test", apiKey: "", baseUrl: "", maxTokens: 100, temperature: 0, permissionMode: "bypassPermissions" };
const measured: ToolResult = { tool: "mcp__host_status__entity_status__abcdef0123456789", success: true, result: JSON.stringify({ entity: "vps", observed_at: "2026-11-25T23:35:00Z", data: { uptime_seconds: 3426300, mem_used_gb: 17.5, mem_total_gb: 31.35 }, display: { uptime: "39 Tage, 15 Stunden, 45 Minuten", memory_used_percent: 55.8 } }) };

async function answer(text: string, tools: ToolResult[]) {
  let turn = 0, execution = 0; const emitted: string[] = [];
  const streamFn: StreamFn = async function* () {
    if (turn++ === 0) { for (let i = 0; i < tools.length; i++) yield { type: "tool_call", text: "", toolCall: { id: `read-${i}`, name: "read", arguments: JSON.stringify({ filePath: `metrics-${i}.json` }) } }; }
    else yield { type: "content", text };
  };
  const result = await runAgent([{ role: "user", content: "VPS status" }], config, process.cwd(), {
    streamFn, nativeToolExecFn: () => tools[execution++], onEvent: e => { if (e.type === "turn_end") emitted.push(e.text); },
  });
  return { result, emitted };
}

test("a metrics-only run cannot finalize the reported blanket service-health claim", async () => {
  const { result, emitted } = await answer("RAM: 17.5 / 31.35 GB (55.8%).\n\nAlles im grünen Bereich.", [measured]);
  assert.doesNotMatch(result.finalText, /Alles im grünen Bereich/);
  assert.match(result.finalText, /keine vollständige Dienstprüfung/);
  assert.match(result.finalText, /RAM: 17.5 \/ 31.35 GB \(55.8%\)/);
  assert.equal(result.messages.at(-1)?.content, result.finalText);
  assert.equal(emitted.at(-1), result.finalText);
});

test("grounding preserves quoted examples, code, scoped conclusions and other evidence", async () => {
  const examples = "Beispiel:\n```text\nAlles im grünen Bereich.\n```\n> Alles gesund.\nDie gemessene RAM-Auslastung ist unauffällig.";
  assert.equal((await answer(examples, [measured])).result.finalText, examples);
  const broad = "Alle Dienste laufen.";
  assert.equal((await answer(broad, [{ tool: "read", success: true, result: "Complete service audit" }])).result.finalText, broad);
  assert.equal((await answer(broad, [{ ...measured, success: false }])).result.finalText, broad);
  assert.equal((await answer(broad, [{ ...measured, result: "not JSON" }])).result.finalText, broad);
  assert.equal((await answer(broad, [measured, { tool: "read", success: true, result: "Complete service audit" }])).result.finalText, broad);
});
