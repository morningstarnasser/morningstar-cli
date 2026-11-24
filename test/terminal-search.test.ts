import { test } from "node:test";
import assert from "node:assert/strict";
import { TerminalViewport } from "../src/runtime/terminal-viewport.js";
import { findTerminalMatches, isFindShortcut } from "../src/runtime/terminal-search.js";

const line = (text: string, wrapped = false) => ({ wrapped, cells: [...text].map(text => ({ text, width: 1 })) });
test("search joins soft wraps, respects hard lines, and treats regex punctuation literally", () => {
  const lines = [line("const LO"), line("AD = 42", true), line("load [x]"), line("next")];
  assert.deepEqual(findTerminalMatches(lines, "load"), [
    { start: { row: 0, column: 6 }, end: { row: 1, column: 2 } },
    { start: { row: 2, column: 0 }, end: { row: 2, column: 4 } },
  ]);
  assert.equal(findTerminalMatches(lines, "[x]").length, 1);
  assert.equal(findTerminalMatches(lines, "[x]next").length, 0);
  assert.deepEqual(findTerminalMatches(lines, ""), []);
});
test("search highlights correct terminal columns for wide emoji and case-folded Unicode", () => {
  const lines = [{ wrapped: false, cells: [{ text: "👋", width: 2 }, { text: "", width: 0 }, { text: "İ", width: 1 }, { text: "x", width: 1 }] }];
  assert.deepEqual(findTerminalMatches(lines, "👋"), [{ start: { row: 0, column: 0 }, end: { row: 0, column: 2 } }]);
  assert.deepEqual(findTerminalMatches(lines, "i\u0307x"), [{ start: { row: 0, column: 2 }, end: { row: 0, column: 4 } }]);
});
test("Ctrl+F and forwarded Cmd+F use the same search without swallowing plain f", () => {
  assert.equal(isFindShortcut("\x06"), true);
  assert.equal(isFindShortcut("\x1b[102;9u"), true);
  assert.equal(isFindShortcut("\x1b[27;9;102~"), true);
  assert.equal(isFindShortcut("f"), false);
});
test("search navigates matches while live output continues and Esc restores it", async t => {
  let output = "";
  const view = new TerminalViewport({ columns: 100, rows: 8, write: text => { output += text; } });
  t.after(() => view.dispose());
  view.feed(Array.from({ length: 30 }, (_, n) => `${n === 2 || n === 22 ? 'MATCH' : 'line'} ${n}\r\n`).join("")); await view.flush();
  await view.find(); await view.searchInput("match");
  assert.match(output, /1\/2/); assert.match(output, /48;2;244;194;122/);
  await view.searchInput("\r"); assert.match(output.slice(-300), /2\/2/);
  await view.searchInput("\x1b[A"); assert.match(output.slice(-300), /1\/2/);
  await view.searchInput("\x15"); await view.searchInput("absent"); assert.match(output.slice(-300), /0\/0/);
  await view.searchInput("\x7f"); assert.match(output.slice(-300), /absen▏/);
  view.feed("LIVE_FINISHED"); await view.flush();
  await view.scroll(100); assert.equal(view.searching, true);
  await view.searchInput("\x1b"); assert.equal(view.active, false); assert.equal(view.searching, false);
  assert.match(output.split("\x1b[?1049l").at(-1)!, /LIVE_FINISHED/);
});
test("search ignores terminal control injection in paste and exits cleanly on resize", async t => {
  let output = "";
  const view = new TerminalViewport({ columns: 70, rows: 8, write: text => { output += text; } });
  t.after(() => view.dispose()); view.feed("text"); await view.flush(); await view.find();
  await view.searchInput("\x1b[200~text\x1b[201~"); assert.match(output.slice(-300), /1\/1/);
  const previous = output; await view.searchInput("\x1b]52;c;evil\x07"); assert.equal(output, previous);
  view.resize(60, 10); assert.equal(view.searching, false); assert.equal(view.active, false);
});
