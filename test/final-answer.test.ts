import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractFinalAnswerText,
  isFinalAnswerTool,
  unknownToolMessage,
} from "../src/final-answer.js";

test("recognises invented reply tools in every spelling", () => {
  for (const name of [
    "answer",
    "Answer",
    "final_answer",
    "final-answer",
    "finalAnswer",
    "respond",
    "reply_to_user",
    "message",
    "say",
    "response",
  ]) {
    assert.equal(isFinalAnswerTool(name), true, `${name} should be an answer alias`);
  }
});

test("never swallows a real tool", () => {
  for (const name of [
    "read",
    "write",
    "edit",
    "bash",
    "grep",
    "glob",
    "ls",
    "git",
    "web",
    "fetch",
    "gh",
    "notebook_edit",
    "bg_status",
    "bg_list",
    "verify",
    "skill",
    "vault",
    "jerry",
  ]) {
    assert.equal(isFinalAnswerTool(name), false, `${name} is a real tool`);
  }
});

test("unrelated invented tools stay unknown", () => {
  assert.equal(isFinalAnswerTool("deploy"), false);
  assert.equal(isFinalAnswerTool("search_web"), false);
  assert.equal(isFinalAnswerTool("mcp__foo__bar"), false);
});

test("extracts the reply from the text protocol payload", () => {
  assert.equal(extractFinalAnswerText({ raw: "  Hi, ich bin Morningstar.  " }), "Hi, ich bin Morningstar.");
});

test("extracts the reply from native argument shapes", () => {
  assert.equal(extractFinalAnswerText({ text: "a" }), "a");
  assert.equal(extractFinalAnswerText({ answer: "b" }), "b");
  assert.equal(extractFinalAnswerText({ message: "c" }), "c");
  assert.equal(extractFinalAnswerText({ content: "d" }), "d");
});

test("unwraps one level of nested JSON", () => {
  assert.equal(extractFinalAnswerText({ raw: '{"text":"nested reply"}' }), "nested reply");
});

test("falls back to a lone string value", () => {
  assert.equal(extractFinalAnswerText({ whatever: "only value" }), "only value");
});

test("returns empty when there is nothing to say", () => {
  assert.equal(extractFinalAnswerText({}), "");
  assert.equal(extractFinalAnswerText({ raw: "   " }), "");
  assert.equal(extractFinalAnswerText({ a: "x", b: "y" }), "");
});

test("unknown-tool message lists real tools and offers the text escape hatch", () => {
  const message = unknownToolMessage("deploy");
  assert.match(message, /Unbekanntes Tool: deploy/);
  assert.match(message, /read/);
  assert.match(message, /jerry/);
  assert.match(message, /einfach Text ohne Tool-Aufruf/);
});
