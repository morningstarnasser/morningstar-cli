import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "ink";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { Markdown, markdownTokens } from "../src/components/Markdown.js";

test("Markdown renders semantic emphasis, lists, code and safe literal HTML", async () => {
  const stdout = new PassThrough() as any; stdout.columns = 100; stdout.isTTY = false;
  const stdin = new PassThrough() as any; stdin.isTTY = false;
  let result = ""; stdout.on("data", (chunk: Buffer) => { result += chunk.toString(); });
  const text = "**Fertig.** Klarer Text mit `code()` und *Betonung*.\n\n- Erster Punkt\n- [x] Erledigt\n\n```ts\nconst x = 7;\n```\n\n<img src=x onerror=bad()>";
  const app = render(React.createElement(Markdown, { text }), { stdout, stdin, stderr: stdout, debug: true, exitOnCtrlC: false });
  await new Promise(r => setTimeout(r, 50)); app.unmount();
  const visible = stripVTControlCharacters(result);
  assert.match(visible, /Fertig\. Klarer Text mit code\(\)/); assert.doesNotMatch(visible, /\*\*Fertig/);
  assert.match(visible, /• Erster Punkt/); assert.match(visible, /✓ Erledigt/); assert.match(visible, /const x = 7/);
  assert.match(visible, /<img src=x onerror=bad\(\)>/);
});

test("Markdown strips terminal escape injection, keeps incomplete fences and all code lines", () => {
  const tokens = markdownTokens("**Safe**\x1b]52;c;ZXhmaWw=\x07\x1b[2J\n\n```ts\nconst a = 1;\n");
  assert.doesNotMatch(JSON.stringify(tokens), /ZXhmaWw|u001b|u0007/);
  assert.equal(tokens.at(-1)?.type, "code");
  const code = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
  assert.equal((markdownTokens("```\n" + code + "\n```")[0] as any).text, code);
});

test("many formatted blocks share resize observation and react to width changes without listener leaks", async () => {
  const { useTerminalColumns } = await import("../src/hooks/useTerminalColumns.js");
  const { Text, Box } = await import("ink");
  const stdout = new PassThrough() as any; stdout.columns = 60; stdout.isTTY = false;
  const stdin = new PassThrough() as any; stdin.isTTY = false;
  let result = ""; stdout.on("data", (chunk: Buffer) => { result += chunk.toString(); });
  function Probe() { return React.createElement(Text, {}, String(useTerminalColumns())); }
  const app = render(React.createElement(Box, { flexDirection: "column" }, Array.from({ length: 30 }, (_, i) => React.createElement(Probe, { key: i }))), { stdout, stdin, stderr: stdout, debug: true, exitOnCtrlC: false });
  await new Promise(r => setTimeout(r, 40)); assert.ok(stdout.listenerCount("resize") <= 2);
  stdout.columns = 90; stdout.emit("resize"); await new Promise(r => setTimeout(r, 40)); assert.match(result, /90/);
  app.unmount(); await new Promise(r => setTimeout(r, 40)); assert.equal(stdout.listenerCount("resize"), 0);
});
