import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHud, collapseOutput, paginate } from "../src/tui-format.js";

test("formatHud shows model and optional fields", () => {
  const hud = formatHud({ model: "claude-fable-5", cwd: "/repo/morningstar-cli", tokens: 1500, costUsd: 0.02, turn: 3 });
  assert.ok(hud.includes("claude-fable-5"));
  assert.ok(hud.includes("morningstar-cli"));
  assert.ok(hud.includes("1.5k"));
  assert.ok(hud.includes("0.020"));
});

test("formatHud with only a model", () => {
  assert.equal(formatHud({ model: "deepseek-chat" }), "🧠 deepseek-chat");
});

test("collapseOutput leaves short text untouched", () => {
  assert.equal(collapseOutput("a\nb\nc", 20), "a\nb\nc");
});

test("collapseOutput folds long text with a marker", () => {
  const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
  const out = collapseOutput(text, 20, 5);
  assert.ok(out.includes("ausgeblendet"));
  assert.ok(out.includes("line 0"));
  assert.ok(out.includes("line 99"));
  assert.ok(out.split("\n").length < 20);
});

test("paginate splits long text into bounded pages", () => {
  const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
  const pages = paginate(text, 200);
  assert.ok(pages.length > 1);
  for (const p of pages) assert.ok(p.length <= 200);
});

test("paginate returns one page for short text", () => {
  assert.deepEqual(paginate("hi", 100), ["hi"]);
  assert.deepEqual(paginate("", 100), []);
});
