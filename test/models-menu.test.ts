import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_MENU, buildModelKeyboard, modelFromCallback, modelMenuText, providerOf } from "../src/telegram/models-menu.js";
import { listProviders } from "../src/providers.js";

test("menu starts with the Claude CLI (subscription) brain", () => {
  assert.equal(MODEL_MENU[0].model, "claude-cli");
  assert.equal(MODEL_MENU[0].provider, "claude-cli");
});

test("menu exposes every installed Ollama model from the shared catalog", () => {
  const catalog = listProviders().find(({ name }) => name === "ollama")?.models
    .filter((model) => !model.startsWith("(")) ?? [];
  const menu = MODEL_MENU.filter(({ provider }) => provider === "ollama").map(({ model }) => model);
  assert.deepEqual(menu, catalog);
  for (const model of catalog) assert.equal(providerOf(model), "ollama");
});

test("keyboard has one button per model plus a close row", () => {
  const kb = buildModelKeyboard(() => true);
  const modelButtons = kb.flat().filter((b) => /^m:\d+$/.test(b.callback_data));
  assert.equal(modelButtons.length, MODEL_MENU.length);
  for (const row of kb) assert.ok(row.length <= 2);
});

test("has a close/back button", () => {
  const kb = buildModelKeyboard(() => true);
  assert.ok(kb.flat().some((b) => b.callback_data === "m:close"));
});

test("callback_data stays within Telegram's 64-byte limit", () => {
  for (const row of buildModelKeyboard(() => true)) {
    for (const btn of row) assert.ok(Buffer.byteLength(btn.callback_data) <= 64);
  }
});

test("model buttons round-trip to the correct model", () => {
  buildModelKeyboard(() => true).flat()
    .filter((b) => /^m:\d+$/.test(b.callback_data))
    .forEach((btn, i) => {
      assert.equal(modelFromCallback(btn.callback_data), MODEL_MENU[i].model);
    });
});

test("invalid callback data returns null", () => {
  assert.equal(modelFromCallback("nope"), null);
  assert.equal(modelFromCallback("m:999"), null);
  assert.equal(modelFromCallback(""), null);
});

test("key marker reflects availability", () => {
  const withKeys = buildModelKeyboard((p) => p === "deepseek").flat();
  assert.ok(withKeys.find((b, i) => MODEL_MENU[i].provider === "deepseek")!.text.includes("✅"));
  assert.ok(withKeys.find((b, i) => MODEL_MENU[i].provider === "anthropic")!.text.includes("🔑"));
});

test("menu text highlights the current model", () => {
  assert.ok(modelMenuText("deepseek-chat").includes("Aktuell"));
  assert.ok(!modelMenuText().includes("Aktuell"));
});

test("current model is marked in the keyboard", () => {
  const kb = buildModelKeyboard(() => true, "deepseek-chat").flat();
  assert.ok(kb.find((b, i) => MODEL_MENU[i].model === "deepseek-chat")!.text.startsWith("●"));
});
