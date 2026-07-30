import { test } from "node:test";
import assert from "node:assert/strict";
import { extractToolCalls } from "../src/tool-parser.js";

test("extracts a simple tool call", () => {
  const calls = extractToolCalls("ok <tool:bash>ls -la</tool> done");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "bash");
  assert.equal(calls[0].args, "ls -la");
});

test("extracts multiple calls in order", () => {
  const calls = extractToolCalls("<tool:read>a.txt</tool> then <tool:bash>pwd</tool>");
  assert.deepEqual(calls.map((c) => c.name), ["read", "bash"]);
});

test("ignores a tool tag quoted in inline code", () => {
  const calls = extractToolCalls("Beispiel: `<tool:bash>rm -rf /</tool>` — nur Demo.");
  assert.equal(calls.length, 0);
});

test("still runs a real call alongside a quoted one", () => {
  const calls = extractToolCalls("Zeig dir `<tool:bash>sudo rm</tool>`, aber ich mache <tool:ls>.</tool>");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "ls");
});

test("ignores nested tool tags", () => {
  const calls = extractToolCalls("<tool:bash>echo <tool:bash>inner</tool></tool>");
  // The inner-closed match would be nested; outer contains a <tool:> → ignored.
  assert.ok(calls.every((c) => !c.args.includes("<tool:")));
});

test("skips oversized payloads", () => {
  const big = "x".repeat(50);
  const calls = extractToolCalls(`<tool:write>${big}</tool>`, { maxPayload: 10 });
  assert.equal(calls.length, 0);
});

test("supports the <tool:name>...</tool:name> closing variant", () => {
  const calls = extractToolCalls("<tool:grep>foo</tool:grep>");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "grep");
});
