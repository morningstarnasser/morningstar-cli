import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { isMalformedToolAttempt } from "../src/runtime/tool-protocol.js";
import { parseStatusTargets, readEntityStatus } from "../src/runtime/status-mcp.js";
import { runAgent, type StreamFn } from "../src/agent-runner.js";
import { printExitCode } from "../src/print-mode.js";
import { parseSettings } from "../src/settings-sources.js";
import { connectConfiguredMCPServers, disconnectAllMCPServers, getConnectedMCPTools } from "../src/mcp.js";
import type { CLIConfig } from "../src/types.js";

const config: CLIConfig = { provider: "ollama", model: "test", apiKey: "", baseUrl: "", maxTokens: 100, temperature: 0 };

test("standalone broken MCP calls are detected; quoted examples and prose stay text", () => {
  for (const value of ['<tool:mcp__vps_status__entity_status>{"entity":"vps"}', 'tool:mcp__vps_status__entity_status{"entity":"pi"}']) assert.equal(isMalformedToolAttempt(value), true);
  for (const value of ['Beispiel: <tool:read>file', '`<tool:read>file`', '```\n<tool:read>file\n```', '<tool:read>file</tool>', 'Hallo!']) assert.equal(isMalformedToolAttempt(value), false);
});

test("a preamble or an unrelated code block cannot hide unfinished tool invocations", () => {
  for (const prefix of ["Ich prüfe den VPS.\n\n", "```text\nexample\n```\n\n"]) {
    assert.equal(isMalformedToolAttempt(prefix + '<tool:mcp__atlas__status>{"host":"vps"}'), true);
  }
  assert.equal(isMalformedToolAttempt('Zitat:\n```xml\n<tool:read>file\n```'), false);
  assert.equal(isMalformedToolAttempt('Zitat:\n> <tool:read>file'), false);
});

test("the reported VPS response is repaired and ends with an error flag if still malformed", async () => {
  const response = 'Ich prüfe den Status deines VPS.\n\n<tool:mcp__atlas__get_system>{"account":"vps"}\n<tool:mcp__atlas__get_metrics>{"account":"vps"}';
  const result = await runAgent([{ role: "user", content: "gib mir vps status" }], config, process.cwd(), {
    streamFn: async function* () { yield { type: "content", text: response }; },
  });
  assert.equal(result.turns, 3);
  assert.ok(result.toolProtocolError);
  assert.equal(result.messages.at(-1)?.isError, true);
  assert.ok(!result.finalText.includes("<tool:"));
  assert.equal(result.toolCalls.length, 0);
});

test("malformed attempt is repaired through normal native authorization, never executed directly", async () => {
  let calls = 0;
  let executions = 0;
  const streamFn: StreamFn = async function* (messages) {
    if (calls++ === 0) yield { type: "content", text: '<tool:mcp__fake__status>{"entity":"vps"}' };
    else if (calls === 2) {
      assert.match(messages.at(-1)!.content, /NICHT ausgeführt/);
      yield { type: "tool_call", text: "", toolCall: { id: "real", name: "bash", arguments: '{"command":"echo forbidden"}' } };
    } else yield { type: "content", text: "Der Befehl wurde blockiert." };
  };
  const result = await runAgent([{ role: "user", content: "status" }], { ...config, permissionMode: "bypassPermissions", disallowedTools: ["bash"] }, process.cwd(), {
    streamFn, nativeToolExecFn: () => { executions++; throw new Error("must not execute"); }, textToolExecFn: () => { executions++; throw new Error("must not execute"); },
  });
  assert.equal(executions, 0);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].success, false);
  assert.match(result.finalText, /blockiert/);
});

test("repeated malformed output ends as a protocol failure, not a successful answer", async () => {
  const streamFn: StreamFn = async function* () { yield { type: "content", text: '<tool:mcp__fake__status>{"entity":"vps"}' }; };
  const result = await runAgent([{ role: "user", content: "status" }], config, process.cwd(), { streamFn });
  assert.equal(result.turns, 3);
  assert.equal(result.toolCalls.length, 0);
  assert.match(result.toolProtocolError!, /nicht ausgeführt/);
  assert.equal(printExitCode(result), 1);
  const limited = await runAgent([{ role: "user", content: "status" }], config, process.cwd(), { streamFn, maxTurns: 1 });
  assert.equal(limited.turns, 1);
  assert.equal(printExitCode(limited), 1);
});

test("valid correction returns the actual tool result to the model", async () => {
  let calls = 0;
  const streamFn: StreamFn = async function* (messages) {
    if (calls++ === 0) yield { type: "content", text: '<tool:mcp__wrong>{"entity":"vps"}' };
    else if (calls === 2) yield { type: "tool_call", text: "", toolCall: { id: "measured", name: "read", arguments: '{"filePath":"status.json"}' } };
    else { assert.ok(messages.some(message => message.role === "tool" && message.content === "load1=0.73")); yield { type: "content", text: "Gemessener Load: 0.73." }; }
  };
  const result = await runAgent([{ role: "user", content: "status" }], { ...config, permissionMode: "bypassPermissions" }, process.cwd(), { streamFn, nativeToolExecFn: () => ({ tool: "read", success: true, result: "load1=0.73" }) });
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.finalText, "Gemessener Load: 0.73.");
  assert.equal(result.toolProtocolError, undefined);
});

test("status connector reads only configured targets, rejects argument URLs and redirects", async (t) => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url === "/redirect") { response.writeHead(302, { Location: "/private" }); response.end(); }
    else if (request.url === "/large") response.end(JSON.stringify({ text: "x".repeat(65_000) }));
    else if (request.url === "/invalid") response.end("not json");
    else response.end(JSON.stringify({ load1: 0.73, generated_at: "2026-11-24T10:00:00Z" }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const targets = parseStatusTargets({ vps: { label: "Test VPS", url: `${url}/status` } });
  const result = await readEntityStatus(targets, { entity: "vps" });
  assert.equal((result.data as { load1: number }).load1, 0.73);
  assert.equal(result.label, "Test VPS"); assert.ok(result.observed_at);
  await assert.rejects(readEntityStatus(targets, { entity: "pi" }), /Kein Status-Zugang/);
  await assert.rejects(readEntityStatus(targets, { entity: "vps", url: `${url}/private` }), /Kein Status-Zugang/);
  for (const path of ["redirect", "large", "invalid"]) await assert.rejects(readEntityStatus(parseStatusTargets({ vps: { label: "Test", url: `${url}/${path}` } }), { entity: "vps" }));
  assert.ok(!requests.some(request => request.includes("private")));
  assert.ok(requests.every(request => request.startsWith("GET ")));
  assert.throws(() => parseStatusTargets({ vps: { label: "Test", url: "file:///etc/passwd" } }));
  assert.throws(() => parseStatusTargets({ vps: { label: "Test", url: "https://user:secret@example.com" } }));
});

test("only explicitly enabled MCP servers auto-connect and advertise their real tools", async (t) => {
  t.after(() => disconnectAllMCPServers());
  const fixture = fileURLToPath(new URL("./fixtures/mcp-echo-server.mjs", import.meta.url));
  const settings = parseSettings({ mcpServers: {
    active: { command: process.execPath, args: [fixture], autoConnect: true },
    inactive: { command: "/missing-server", autoConnect: false },
    manual: { command: "/missing-server" },
    broken: { command: "/missing-server", autoConnect: true },
  } });
  const failures = await connectConfiguredMCPServers(settings);
  assert.equal(failures.length, 1); assert.match(failures[0], /broken/);
  assert.ok(getConnectedMCPTools().some(tool => tool.serverName === "active"));
  assert.ok(getConnectedMCPTools().every(tool => tool.serverName === "active"));
  assert.throws(() => parseSettings({ mcpServers: { bad: { command: "node", autoConnect: "true" } } }), /autoConnect/);
});
