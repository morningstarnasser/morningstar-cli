import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "ink";
import { PassThrough } from "node:stream";
import { remoteTimeline } from "../src/remote-timeline.js";
import { parseBackendEvent } from "../src/providers/backend-events.js";
import { RemotePairing } from "../src/components/RemoteControlPanel.js";
import { qrRows } from "../src/terminal-qr.js";
import { TerminalViewport } from "../src/runtime/terminal-viewport.js";
import { remoteScript } from "../src/remote-page.js";

test("remote timeline preserves execution order and excludes pairing secrets, system UI and reasoning", () => {
  const entries = remoteTimeline([
    { id: 1, type: "text", content: "> hello" },
    { id: 2, type: "info", content: "SECRET" },
    { id: 3, type: "remote-pairing", content: "SECRET" },
    { id: 4, type: "work-log", toolResults: [{ tool: "bash", result: "OK", success: true, command: "echo OK" }] },
    { id: 5, type: "notice", content: "Skill budget" },
    { id: 6, type: "ai-response", streamingText: "**Done**" },
  ]);
  assert.deepEqual(entries.map(e => e.kind), ["message", "work", "notice", "message"]);
  assert.equal(JSON.stringify(entries).includes("SECRET"), false);
  assert.equal(entries.at(-1)?.id, "6");
});

test("nonfatal Codex notices are not failed tools while actual command and turn failures remain failures", () => {
  const notice = parseBackendEvent(JSON.stringify({ type: "item.completed", item: { id: "notice", type: "error", message: "Exceeded skills context budget." } }));
  assert.equal(notice?.activity?.notice, "Exceeded skills context budget.");
  assert.equal(notice?.activity?.result, undefined);
  assert.equal(notice?.activity?.status, "completed");
  const failed = parseBackendEvent(JSON.stringify({ type: "item.completed", item: { id: "bad", type: "command_execution", exit_code: 1, command: "false" } }));
  assert.equal(failed?.activity?.result?.success, false);
  assert.throws(() => parseBackendEvent('{"type":"error","message":"fatal"}'), /fatal/);
});

test("QR rendering confines black/white backgrounds to QR cells; viewport restores default attributes", async t => {
  const stdout = new PassThrough() as any; stdout.columns = 120; stdout.isTTY = false;
  const stdin = new PassThrough() as any; stdin.isTTY = false;
  let output = ""; stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const app = render(React.createElement(RemotePairing, { url: "http://127.0.0.1:12345/#pair=fixture", label: "Test" }), { stdout, stdin, stderr: stdout, debug: true, exitOnCtrlC: false });
  await new Promise(r => setTimeout(r, 30)); app.unmount();
  let physical = ""; const view = new TerminalViewport({ columns: 120, rows: 50, write: text => { physical += text; } });
  t.after(() => view.dispose());
  view.feed(output + "\r\nAFTER_QR\r\n"); await view.flush();
  const buffer = view.terminal.buffer.active;
  for (let row = 0; row < buffer.length; row++) {
    const line = buffer.getLine(row)!;
    if (line.translateToString(true).includes("AFTER_QR")) for (let x = 0; x < 120; x++) assert.equal(line.getCell(x)!.isBgDefault(), true);
  }
  await view.enter(); await view.leave();
  assert.match(physical, /\x1b\[0m\x1b\[\d+;\d+H\x1b\[\?25l$/);
  const rows = qrRows("fixture");assert.ok(rows[0].every(c => !c.top && !c.bottom));
});

test("remote browser script parses without dynamic HTML injection", () => {
  assert.doesNotThrow(() => new Function(remoteScript));
  assert.equal(remoteScript.includes("innerHTML"), false);
});
