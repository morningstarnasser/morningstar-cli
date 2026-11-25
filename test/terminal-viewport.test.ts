import { test } from "node:test";
import xterm from "@xterm/headless";
import assert from "node:assert/strict";
import { TerminalViewport } from "../src/runtime/terminal-viewport.js";
function fixture(t: any, columns = 24, rows = 6) {
  let output = "", copied = "";
  const view = new TerminalViewport({ columns, rows, write: data => { output += data; }, copy: async text => { copied = text; } });
  t.after(() => view.dispose()); return { view, output: () => output, copied: () => copied };
}
test("wheel scroll exposes older actual output and keeps foreground colors", async t => {
  const f = fixture(t); f.view.feed(Array.from({ length: 30 }, (_, n) => `\x1b[32mline ${n}\x1b[0m\r\n`).join("")); await f.view.flush();
  await f.view.scroll(-12); assert.equal(f.view.active, true); assert.match(f.output(), /line 13/); assert.match(f.output(), /38;5;2/);
  await f.view.home(); assert.match(f.output(), /line 0/); await f.view.leave(); assert.equal(f.view.active, false); assert.match(f.output(), /\x1b\[\?1049l/);
});
test("dragging code highlights cells and copies selected text without terminal escapes", async t => {
  const f = fixture(t); f.view.feed('\x1b[1;38;2;142;205;248mconst x = 42;\x1b[0m\r\nsecond line'); await f.view.flush();
  await f.view.pointer("down", 1, 1); await f.view.pointer("move", 14, 1); await f.view.pointer("up", 14, 1);
  assert.equal(f.copied(), "const x = 42;"); assert.match(f.output(), /48;2;142;205;248/); assert.match(f.output(), /Kopiert/);
});
test("frozen selection survives live updates; leaving restores new output and cursor", async t => {
  const f = fixture(t); f.view.feed('old answer\r\n> draft'); await f.view.flush();
  await f.view.pointer("down", 1, 1); await f.view.pointer("move", 11, 1);
  f.view.feed('\x1b[1;1Hnew answer'); await f.view.flush();
  assert.equal(f.view.selectedText(), "old answer"); await f.view.copy(); assert.equal(f.copied(), "old answer");
  await f.view.leave(); assert.match(f.output().split('\x1b[?1049l').at(-1)!, /new answer/);
});
test("selection joins soft wraps, preserves hard newlines, handles wide glyphs and reverse dragging", async t => {
  const f = fixture(t, 12, 8); f.view.feed('中文abcdefghij\r\nnext'); await f.view.flush();
  await f.view.pointer('down', 5, 3); await f.view.pointer('move', 1, 1); await f.view.pointer('up', 1, 1);
  assert.equal(f.copied(), '中文abcdefghij\nnext');
});
test("resize exits frozen view and mirrors erased/replaced output rather than keeping transient frames", async t => {
  const f = fixture(t); f.view.feed('stale\r\x1b[2Kfresh\r\n'); await f.view.flush(); await f.view.enter();
  await f.view.resize(40, 10); assert.equal(f.view.active, false); assert.equal(f.view.terminal.cols, 40);
  const line = f.view.terminal.buffer.active.getLine(0)!.translateToString(true); assert.equal(line, "fresh");
});
test("first short frame can align with a terminal already below a shell prompt", async t => {
  const f = fixture(t); f.view.feed('answer\r\n> draft'); await f.view.flush(); await f.view.alignCursor(4);
  await f.view.pointer('down',1,3);await f.view.pointer('move',7,3);await f.view.pointer('up',7,3);assert.equal(f.copied(),'answer');
});
test("emoji sequences and combining accents use the same cells as the input editor", async t => {
  const { composerLayout } = await import("../src/runtime/composer-layout.js");
  const f = fixture(t, 40, 6), text = 'e\u0301 👨‍👩‍👧‍👦🇨🇭done'; f.view.feed(text); await f.view.flush();
  const cells = composerLayout(text, '', 40)[0]; assert.equal(f.view.terminal.buffer.active.cursorX, cells.at(-1)!.x);
  await f.view.pointer('down',7,1);await f.view.pointer('move',11,1);await f.view.pointer('up',11,1);assert.equal(f.copied(),'done');
});

test("click opens the complete captured detail; dragging its marker still selects and live work continues", async t => {
  let output = "", opened = 0;
  const view = new TerminalViewport({ columns: 70, rows: 8, write: s => { output += s; }, copy: async () => {}, detail: id => {
    assert.equal(id, "r1"); opened++; return { title: "Full diff", body: Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n") };
  } });
  t.after(() => view.dispose());
  view.feed("▸ Details [r1]\r\nworking"); await view.flush();
  await view.pointer("down", 1, 1); await view.pointer("move", 10, 1); await view.pointer("up", 10, 1);
  assert.equal(opened, 0);
  await view.pointer("down", 5, 1); await view.pointer("up", 5, 1);
  assert.equal(opened, 1); assert.match(output, /Full diff/);
  await view.scroll(100); assert.match(output, /line 39/); assert.equal(view.active, true);
  view.feed("\r\nAGENT_FINISHED_WHILE_READING"); await view.flush();
  await new Promise(resolve => setTimeout(resolve, 120)); assert.match(output, /neue Updates/);
  await view.pointer("down", 3, 8);
  assert.equal(view.active, false); assert.match(output.split("\x1b[?1049l").at(-1)!, /AGENT_FINISHED_WHILE_READING/);
});

test("scrolling to the bottom after a click or completed selection resumes live without typing", async t => {
  const f = fixture(t, 70, 8);
  f.view.feed(Array.from({ length: 30 }, (_, n) => `line ${n}\r\n`).join("")); await f.view.flush();
  await f.view.scroll(-5); await f.view.pointer("down", 1, 2); await f.view.pointer("up", 1, 2);
  f.view.feed("LATEST"); await f.view.flush();
  await f.view.scroll(100); assert.equal(f.view.active, false); assert.match(f.output().split("\x1b[?1049l").at(-1)!, /LATEST/);
  await f.view.scroll(-5); await f.view.pointer("down", 1, 2); await f.view.pointer("move", 5, 2); await f.view.pointer("up", 5, 2);
  await f.view.scroll(100); assert.equal(f.view.active, false);
});

test("bottom dock stays at the last content row after short output, resize and leaving search", async t => {
  const screen = new xterm.Terminal({ cols: 70, rows: 12, allowProposedApi: true });
  const view = new TerminalViewport({ columns: 70, rows: 12, dockHeight: () => 2, write: value => screen.write(value) });
  t.after(() => { view.dispose(); screen.dispose(); });
  const flush = () => new Promise<void>(resolve => screen.write("", resolve));
  view.feed("answer\r\n> draft\r\nContext footer\r\n"); await view.renderLive(); await flush();
  assert.equal(screen.buffer.active.getLine(0)!.translateToString(true).trimEnd(), "answer");
  assert.equal(screen.buffer.active.getLine(10)!.translateToString(true).trimEnd(), "Context footer");
  await view.find("answer"); await view.leave(); await flush();
  assert.equal(screen.buffer.active.getLine(10)!.translateToString(true).trimEnd(), "Context footer");
  screen.resize(70, 18); view.resize(70, 18);
  view.feed("\x1b[2F> draft\r\nContext footer\r\n"); await view.renderLive(); await flush();
  assert.equal(screen.buffer.active.getLine(16)!.translateToString(true).trimEnd(), "Context footer");
  // The mirror remains free of artificial padding, preserving searchable history.
  assert.equal(view.terminal.buffer.active.getLine(1)!.translateToString(true), "> draft");
  await view.scroll(-3); assert.equal(view.active, true);
  await view.scroll(3); assert.equal(view.active, false);
  await view.scroll(3); await view.scroll(3); assert.equal(view.active, false);
  await flush(); assert.equal(screen.buffer.active.getLine(16)!.translateToString(true).trimEnd(), "Context footer");
});

test("scrollback keeps composer and work status live and follows new output on downward scroll without Esc", async t => {
  const screen = new xterm.Terminal({ cols: 80, rows: 12, allowProposedApi: true });
  const view = new TerminalViewport({ columns: 80, rows: 12, dockHeight: () => 3, liveHeight: () => 3, write: s => screen.write(s) });
  t.after(() => { view.dispose(); screen.dispose(); });
  const flush = () => new Promise<void>(resolve => screen.write("", resolve));
  const row = (n: number) => screen.buffer.active.getLine(n)!.translateToString(true);
  view.feed(Array.from({ length: 40 }, (_, i) => `history ${i}\r\n`).join("") + "RUNNING 1\r\n> draft\r\nstatus\r\n");
  await view.renderLive(); await view.scroll(-12); await flush();
  const before = row(0); assert.match(row(8), /RUNNING 1/); assert.match(row(9), /> draft/);
  assert.equal(view.isLiveRow(10), true); assert.equal(view.isLiveRow(1), false);
  view.feed("\x1b[3F\x1b[JRUNNING 2\r\n> edited draft\r\nstatus updated\r\n"); await view.flush();
  await new Promise(r => setTimeout(r, 130)); await flush();
  assert.equal(row(0), before); assert.match(row(8), /RUNNING 2/); assert.match(row(9), /> edited draft/); assert.match(row(10), /status updated/);
  assert.equal(view.active, true);
  view.feed("\x1b[3F\x1b[JNEW RESULT\r\nDONE\r\n> edited draft\r\nstatus done\r\n"); await view.flush();
  await view.scroll(100); await flush();
  assert.equal(view.active, false); assert.match(Array.from({ length: 12 }, (_, n) => row(n)).join("\n"), /NEW RESULT/);
});

test("completed tall output remains visible when Ink leaves an erased streaming region before a short composer", async t => {
  let output = "";
  const view = new TerminalViewport({ columns: 80, rows: 12, dockHeight: () => 2, liveHeight: () => 2, write: s => { output = s; } });
  t.after(() => view.dispose());
  view.feed(Array.from({ length: 50 }, (_, i) => `answer ${i}\r\n`).join("") + "STREAM_COMPLETE\r\n" + "\r\n".repeat(35) + "> draft\r\nstatus\r\n");
  await view.renderLive(); assert.match(output, /STREAM_COMPLETE/); assert.match(output, /> draft/);
  await view.scroll(-4); await view.scroll(100); assert.equal(view.active, false); assert.match(output, /STREAM_COMPLETE/);
  await view.scroll(100); assert.equal(view.active, false); assert.match(output, /STREAM_COMPLETE/);
});
