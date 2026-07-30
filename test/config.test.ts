import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isUserAllowed,
  normalizeFallbackModels,
  parseAllowedUsers,
} from "../src/telegram/config.js";

test("parses comma/space separated user ids", () => {
  assert.deepEqual(parseAllowedUsers("100001, 123 456"), [100001, 123, 456]);
});

test("drops invalid entries", () => {
  assert.deepEqual(parseAllowedUsers("1,abc,-5,0,7"), [1, 7]);
});

test("empty input yields empty list", () => {
  assert.deepEqual(parseAllowedUsers(""), []);
  assert.deepEqual(parseAllowedUsers(undefined), []);
});

test("allow-list fails closed when empty", () => {
  assert.equal(isUserAllowed(123, []), false);
});

test("denies users not on the list", () => {
  assert.equal(isUserAllowed(999, [123, 456]), false);
});

test("allows users on the list", () => {
  assert.equal(isUserAllowed(456, [123, 456]), true);
});

test("denies undefined user id", () => {
  assert.equal(isUserAllowed(undefined, [123]), false);
});

test("Telegram cloud fallbacks are disabled unless explicitly configured", () => {
  assert.deepEqual(normalizeFallbackModels(undefined), []);
  assert.deepEqual(normalizeFallbackModels(null), []);
  assert.deepEqual(normalizeFallbackModels("deepseek-chat"), []);
});

test("Telegram keeps a bounded explicit fallback model list", () => {
  assert.deepEqual(
    normalizeFallbackModels([
      "deepseek-chat",
      "",
      " deepseek-reasoner ",
      "deepseek-chat",
      "bad model id",
      42,
    ]),
    ["deepseek-chat", "deepseek-reasoner"],
  );
});
