import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composerRule,
  fitText,
  getProviderLocation,
  getTerminalDensity,
  normalizeTerminalColumns,
  suggestionLimit,
} from "../src/tui-layout.js";

test("terminal layout adapts at 60, 80, and 120 columns", () => {
  assert.equal(getTerminalDensity(60), "compact");
  assert.equal(getTerminalDensity(80), "comfortable");
  assert.equal(getTerminalDensity(120), "wide");
  assert.equal(suggestionLimit(60), 6);
  assert.equal(suggestionLimit(80), 8);
  assert.equal(suggestionLimit(120), 10);
  assert.equal(composerRule(60).length, 58);
  assert.equal(composerRule(80).length, 78);
  assert.equal(composerRule(120).length, 118);
});

test("invalid widths fall back to a stable 80-column layout", () => {
  assert.equal(normalizeTerminalColumns(undefined), 80);
  assert.equal(normalizeTerminalColumns(Number.NaN), 80);
  assert.equal(normalizeTerminalColumns(10), 80);
});

test("provider location distinguishes local, hosted, and subscription providers", () => {
  assert.equal(getProviderLocation("hydra-local"), "local");
  assert.equal(getProviderLocation("ollama"), "local");
  assert.equal(getProviderLocation("openai"), "hosted");
  assert.equal(getProviderLocation("claude-cli"), "subscription");
});

test("fitText preserves both ends of long paths and model names", () => {
  assert.equal(fitText("short", 10), "short");
  assert.equal(fitText("/Users/example/projects/morningstar", 16), "/Users/e…ingstar");
  assert.equal(fitText("abcdef", 3), "…");
});
