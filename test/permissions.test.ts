import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidPermissionMode,
  shouldAskPermission,
  shouldDenyInDontAskMode,
} from "../src/permissions.js";

test("all public permission modes remain valid", () => {
  for (const mode of [
    "auto",
    "ask",
    "strict",
    "bypassPermissions",
    "acceptEdits",
    "plan",
    "dontAsk",
    "delegate",
  ]) {
    assert.equal(isValidPermissionMode(mode), true);
  }
  assert.equal(isValidPermissionMode("unsafe"), false);
});

test("legacy prompt helper delegates to the fail-closed policy", () => {
  assert.equal(shouldAskPermission("read", "ask"), false);
  assert.equal(shouldAskPermission("write", "ask"), true);
  assert.equal(shouldAskPermission("write", "acceptEdits"), false);
  assert.equal(shouldAskPermission("delete", "acceptEdits"), true);
  assert.equal(shouldAskPermission("write", "plan"), true);
  assert.equal(shouldAskPermission("future_tool", "auto"), true);
});

test("legacy dontAsk helper distinguishes safe, allowed, and denied actions", () => {
  assert.equal(shouldDenyInDontAskMode("read"), false);
  assert.equal(shouldDenyInDontAskMode("write"), true);
  assert.equal(shouldDenyInDontAskMode("write", ["write"]), false);
});
