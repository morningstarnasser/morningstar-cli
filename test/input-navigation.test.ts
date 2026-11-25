import { test, after, mock, type TestContext } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import React from "react";
import { render, useStdin } from "ink";

// Isolate persistence without touching the user's real history or configuration.
const testHome = mkdtempSync(join(os.tmpdir(), "morningstar-input-navigation-"));
const homeMock = mock.method(os, "homedir", () => testHome);
syncBuiltinESMExports();
const { Input } = await import("../src/components/Input.js");
const { clearInputHistory, addToInputHistory } = await import("../src/input-history.js");
after(() => { homeMock.mock.restore(); syncBuiltinESMExports(); rmSync(testHome, { recursive: true, force: true }); });

const up = "\x1b[A", down = "\x1b[B";
const settle = () => new Promise(resolve => setTimeout(resolve, 40));
async function fixture(t: TestContext, processing = false) {
  clearInputHistory();
  addToInputHistory("older prompt");
  addToInputHistory("newer prompt");
  const stdout = new PassThrough() as PassThrough & { columns: number; isTTY: boolean };
  stdout.columns = 100; stdout.isTTY = false;
  const stdin = new PassThrough() as PassThrough & { isTTY: boolean; setRawMode: () => void; ref: () => void; unref: () => void };
  stdin.isTTY = true; stdin.setRawMode = () => {}; stdin.ref = () => {}; stdin.unref = () => {};
  let frame = "", emitter: ReturnType<typeof useStdin>["internal_eventEmitter"];
  stdout.on("data", chunk => { frame = stripVTControlCharacters(String(chunk)); });
  const submitted: string[] = [];
  const onSubmit = (text: string) => { submitted.push(text); };
  const props = { activeAgent: null, planMode: false, thinkMode: false, onSubmit, cwd: testHome,
    suggestions: [{ cmd: "/help", desc: "Help" }, { cmd: "/history", desc: "History" }] };
  function Probe({ busy }: { busy: boolean }) {
    emitter = useStdin().internal_eventEmitter;
    return React.createElement(Input, { ...props, isProcessing: busy });
  }
  const app = render(React.createElement(Probe, { busy: processing }), { stdout, stdin, stderr: stdout, debug: true, exitOnCtrlC: false });
  t.after(() => { app.unmount(); stdin.destroy(); stdout.destroy(); });
  await settle();
  return {
    async key(text: string) { emitter!.emit("input", text); await settle(); },
    async busy(busy: boolean) { app.rerender(React.createElement(Probe, { busy })); await settle(); },
    prompt() { return frame.split("\n").filter(line => /^\s*>(?: |$)/.test(line)).map(line => line.trimEnd()).join("\n"); },
    frame: () => frame,
    submitted,
  };
}

test("Up/Down recall persisted prompts and restore the unsent draft at both boundaries", async t => {
  const ui = await fixture(t);
  await ui.key("unsent draft"); await ui.key(up); assert.match(ui.prompt(), /> newer prompt$/);
  await ui.key(up); await ui.key(up); assert.match(ui.prompt(), /> older prompt$/);
  await ui.key(down); assert.match(ui.prompt(), /> newer prompt$/);
  await ui.key(down); await ui.key(down); assert.match(ui.prompt(), /> unsent draft$/);
  assert.deepEqual(ui.submitted, []);
});

test("Up/Down navigate history during processing and keep the draft across completion", async t => {
  const ui = await fixture(t, true);
  await ui.key("busy draft"); await ui.key(up); assert.match(ui.prompt(), /> newer prompt$/);
  await ui.key(up); assert.match(ui.prompt(), /> older prompt$/);
  await ui.busy(false);
  await ui.key(down); await ui.key(down); assert.match(ui.prompt(), /> busy draft$/);
  assert.deepEqual(ui.submitted, []);
});

test("plain arrows leave queued messages intact; Alt+Up explicitly edits the latest queued draft", async t => {
  const ui = await fixture(t, true);
  await ui.key("queued draft"); await ui.key("\r");
  await ui.key(up); assert.match(ui.prompt(), /> queued draft$/);
  assert.match(ui.frame(), /› queued draft/);
  await ui.key(down); assert.match(ui.prompt(), />$/);
  await ui.key("\x1b\x1b[A"); assert.match(ui.prompt(), /> queued draft$/);
  assert.doesNotMatch(ui.frame(), /› queued draft/);
  assert.deepEqual(ui.submitted, []);
});

test("recalled slash commands do not capture the next history arrow", async t => {
  const ui = await fixture(t);
  await ui.key("/help"); await ui.key("\r");
  await ui.key(up); assert.match(ui.prompt(), /> \/help$/);
  await ui.key(up); assert.match(ui.prompt(), /> newer prompt$/);
  await ui.key(down); await ui.key(down); assert.match(ui.prompt(), />$/);
  await ui.key("/h"); await ui.key(down); await ui.key("\r");
  assert.match(ui.prompt(), /> \/history$/);
  assert.deepEqual(ui.submitted, ["/help"]);
});

test("clearing a recalled entry starts fresh navigation without resurrecting an old draft", async t => {
  const ui = await fixture(t);
  await ui.key("discarded draft"); await ui.key(up); await ui.key("\x15");
  await ui.key(down); assert.match(ui.prompt(), />$/);
  await ui.key(up); assert.match(ui.prompt(), /> newer prompt$/);
  await ui.key(down); assert.match(ui.prompt(), />$/);
});

test("multiline Unicode draft survives a history round-trip and is persisted only on submit", async t => {
  const ui = await fixture(t);
  const draft = "erste Zeile\nzweite 👩🏽‍💻 Zeile";
  await ui.key(draft); await ui.key(up); await ui.key(down); await ui.key("\r");
  assert.deepEqual(ui.submitted, [draft]);
  const entries = JSON.parse(readFileSync(join(testHome, ".morningstar", "input-history.json"), "utf8"));
  assert.equal(entries.at(-1).input, draft);
});

test("file suggestions use arrows before history and Tab applies the selected file", async t => {
  writeFileSync(join(testHome, "fixture-a.txt"), "a"); writeFileSync(join(testHome, "fixture-b.txt"), "b");
  const ui = await fixture(t);
  await ui.key("inspect @fixture-"); await ui.key(down); await ui.key("\t");
  assert.match(ui.prompt(), /> inspect @fixture-b\.txt$/);
  assert.deepEqual(ui.submitted, []);
});

test("Ctrl+R filters history, accepts for editing without sending, and Esc restores the draft while busy", async t => {
  const ui = await fixture(t, true);
  await ui.key("keep this draft"); await ui.key("\x12"); await ui.key("older");
  assert.match(ui.frame(), /Verlauf suchen: older/); assert.match(ui.frame(), /older prompt/);
  await ui.key("\r"); assert.match(ui.prompt(), /> older prompt$/); assert.deepEqual(ui.submitted, []);
  await ui.key("\x12"); await ui.key("not found"); assert.match(ui.frame(), /Keine passende Eingabe/);
  await ui.key("\x1b"); assert.match(ui.prompt(), /> older prompt$/);
  await ui.key("\x12"); await ui.key("\x12"); await ui.key(down); await ui.key("\t");
  assert.match(ui.prompt(), /> newer prompt$/); assert.deepEqual(ui.submitted, []);
});
