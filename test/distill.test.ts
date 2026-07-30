import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDistillPrompt, parseDistillation, formatDistillReport } from "../src/brain/distill.js";

test("builds a numbered prompt from outcomes", () => {
  const p = buildDistillPrompt(["fixed the build", "added tests"]);
  assert.ok(p.includes("1. fixed the build"));
  assert.ok(p.includes("2. added tests"));
});

test("parses bullet lessons of several styles", () => {
  const text = "Hier die Lektionen:\n- deepseek braucht das Text-Tool-Format\n* immer tsc vor commit laufen lassen\n1. NAS-Tunnel kann flappen\nirrelevant line";
  const lessons = parseDistillation(text);
  assert.equal(lessons.length, 3);
  assert.ok(lessons[0].includes("deepseek"));
  assert.ok(!lessons.some((l) => l.includes("irrelevant")));
});

test("drops too-short bullets and caps at 10", () => {
  assert.deepEqual(parseDistillation("- ok"), []);
  const many = Array.from({ length: 15 }, (_, i) => `- lesson number ${i}`).join("\n");
  assert.equal(parseDistillation(many).length, 10);
});

test("formats a report, with and without lessons", () => {
  assert.ok(formatDistillReport([], 3).includes("keine neuen"));
  const r = formatDistillReport(["use deepseek text tools", "run tsc first"], 5);
  assert.ok(r.includes("5 Aufgaben"));
  assert.ok(r.includes("2 Lektionen"));
  assert.ok(r.includes("• use deepseek"));
});
