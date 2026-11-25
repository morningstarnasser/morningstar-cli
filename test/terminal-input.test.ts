import { test } from "node:test";
import assert from "node:assert/strict";
import { joinTerminalInput } from "../src/runtime/terminal-input.js";

test("fragmented mouse and cursor reports never release partial control text", () => {
  for (const sequence of ["\x1b[<65;20;8M", "\x1b[<0;20;8m", "\x1b[44;1R", "[<65;20;8M"]) {
    let pending = "", emitted = "";
    for (const [i, chunk] of [...sequence].entries()) {
      const result = joinTerminalInput(pending, chunk); pending = result.pending; emitted += result.input;
      if (i < sequence.length - 1) assert.equal(emitted, "", JSON.stringify(sequence));
    }
    assert.equal(emitted, sequence); assert.equal(pending, "");
  }
});

test("ordinary typing, arrow keys, bracketed paste and prefix text remain intact", () => {
  for (const sequence of ["hello", "path/file", "\x1b[A", "\x1b[200~", "\x1b[201~"]) assert.equal(joinTerminalInput("", sequence).input, sequence);
  assert.deepEqual(joinTerminalInput("", "draft\x1b[<65;"), { input: "draft", pending: "\x1b[<65;" });
  assert.deepEqual(joinTerminalInput("\x1b[<65;", "20;8Mtail"), { input: "\x1b[<65;20;8Mtail", pending: "" });
  assert.equal(joinTerminalInput("", "\x1b").pending, "\x1b");
});
