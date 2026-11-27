import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgent, type StreamFn } from "../src/agent-runner.js";
import type { CLIConfig, ToolResult } from "../src/types.js";
import { requestsFreshKnownStatus } from "../src/runtime/status-grounding.js";

const config: CLIConfig = { provider: "ollama", model: "test", apiKey: "", baseUrl: "", maxTokens: 100, temperature: 0, permissionMode: "bypassPermissions" };
const measured: ToolResult = { tool: "mcp__host_status__entity_status__abcdef0123456789", success: true, result: JSON.stringify({ entity: "vps", observed_at: "2026-11-25T23:35:00Z", data: { uptime_seconds: 3426300, mem_used_gb: 17.5, mem_total_gb: 31.35 }, display: { uptime: "39 Tage, 15 Stunden, 45 Minuten", memory_used_percent: 55.8 } }) };

test("a new known-host status request cannot complete by recycling an old tool result", async () => {
  const old = {role:'tool' as const, toolName:measured.tool, content:measured.result};
  let turn = 0, reads = 0;
  const result = await runAgent([old,{role:'user',content:'vps status geben'}], config, process.cwd(), {
    streamFn: async function* () {
      if (turn++ === 0) yield {type:'content',text:'Alter VPS-Status ist live.'};
      else if (turn === 2) yield {type:'tool_call',text:'',toolCall:{id:'fresh',name:'read',arguments:'{"filePath":"status.json"}'}};
      else yield {type:'content',text:'Neue Messung: 55.8%.'};
    }, nativeToolExecFn:()=>{reads++;return measured;},
  });
  assert.equal(reads,1);assert.equal(result.turns,3);assert.equal(result.finalText,'Neue Messung: 55.8%.');
  await assert.rejects(runAgent([old,{role:'user',content:'vps status'}],config,process.cwd(),{
    streamFn:async function*(){yield {type:'content',text:'Alter Status ist live.'};},
  }),/Kein neuer Status gemessen/);
  for (const content of ['Wie war der VPS Status gestern?', 'git status', 'Warum bedeutet status etwas?']) assert.equal(requestsFreshKnownStatus([old,{role:'user',content}]),false);
  assert.equal(requestsFreshKnownStatus([{role:'user',content:'vps status'}]),false);
});

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

test("a blanket prefix with a measured explanation is scoped without deleting its values", async () => {
  for (const text of [
    "Alles im grünen Bereich — niedrige Last, ausreichend RAM und Speicher.",
    "**Alles gesund**: RAM 17.5 / 31.35 GB (55.8%).",
  ]) {
    const { result } = await answer(text, [measured]);
    assert.doesNotMatch(result.finalText, /Alles im grünen Bereich|Alles gesund/);
    assert.match(result.finalText, /keine vollständige Dienstprüfung/);
    const explanation = text.slice(text.includes("—") ? text.indexOf("—") : text.indexOf(":"));
    assert.ok(result.finalText.includes(explanation));
  }
});

test("mixed endpoint and SSH snapshots do not establish stability or a complete health audit", async () => {
  const ssh: ToolResult = { tool: "bash", success: true, command: "ssh operator@host 'hostname; uptime -p; free -b; df -B1 /; systemctl is-active dashboard'", result: "host\nup 10 days\nMem: 17000000000 6100000000\nFilesystem 1B-blocks Used Available Use% Mounted on\n/dev/root 1000 300 700 30% /\nactive", exitCode: 0 };
  const input = "**Beide Hosts sind erreichbar und stabil.**\n\n| Host | RAM |\n| Pi | 6.1/17 GB |\n\nKeine Auffälligkeiten.";
  const {result,emitted} = await answer(input, [measured, ssh]);
  assert.doesNotMatch(result.finalText, /erreichbar und stabil|Keine Auffälligkeiten/);
  assert.match(result.finalText, /Langzeitstabilität wurde nicht geprüft/);
  assert.match(result.finalText, /6\.1\/17 GB/);
  assert.equal(result.messages.at(-1)?.content, result.finalText);
  assert.equal(emitted.at(-1), result.finalText);
  const variant = await answer("Beide Hosts erreichbar und stabil.", [measured, ssh]);
  assert.doesNotMatch(variant.result.finalText, /erreichbar und stabil/);
  assert.match(variant.result.finalText, /Langzeitstabilität wurde nicht geprüft/);
  const quote = '> Beide Hosts sind erreichbar und stabil.\n```text\nKeine Auffälligkeiten.\n```';
  assert.equal((await answer(quote, [measured, ssh])).result.finalText, quote);
  assert.equal((await answer(input, [{tool:'read',success:true,result:'Documented multi-day stability audit'}])).result.finalText, input);
});
