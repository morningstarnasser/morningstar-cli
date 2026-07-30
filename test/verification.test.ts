import { test } from "node:test";
import assert from "node:assert/strict";
import { pickChecks, formatVerification } from "../src/verification.js";

test("picks available checks in fast-first order", () => {
  const checks = pickChecks({ build: "tsc", test: "node --test", typecheck: "tsc --noEmit", lint: "eslint ." });
  assert.deepEqual(checks.map((c) => c.name), ["typecheck", "lint", "test", "build"]);
});

test("returns only present scripts", () => {
  assert.deepEqual(pickChecks({ build: "tsc" }).map((c) => c.name), ["build"]);
  assert.deepEqual(pickChecks({}), []);
});

test("maps to npm run commands", () => {
  assert.equal(pickChecks({ typecheck: "tsc --noEmit" })[0].command, "npm run typecheck");
});

test("formats a passing report", () => {
  const out = formatVerification({ checks: [{ name: "typecheck", ok: true, output: "" }], diff: "1 file changed" });
  assert.ok(out.includes("✅ typecheck"));
  assert.ok(out.includes("1 file changed"));
});

test("formats a failing report with the error", () => {
  const out = formatVerification({ checks: [{ name: "test", ok: false, output: "AssertionError: nope" }], diff: "" });
  assert.ok(out.includes("❌ test"));
  assert.ok(out.includes("AssertionError"));
});

test("handles no checks gracefully", () => {
  assert.ok(formatVerification({ checks: [], diff: "" }).includes("Keine Checks"));
});
