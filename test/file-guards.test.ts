import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isBinaryContent, guardRead, guardWrite, resolvePatternWithinWorkspace, resolveWithinWorkspace, MAX_READ_SIZE, MAX_WRITE_SIZE } from "../src/file-guards.js";

test("detects binary via NUL byte", () => {
  assert.equal(isBinaryContent(Buffer.from([0x68, 0x00, 0x69])), true);
  assert.equal(isBinaryContent("plain text"), false);
});

test("guardRead blocks oversized and binary", () => {
  assert.ok(guardRead(MAX_READ_SIZE + 1, "x")?.includes("zu gross"));
  assert.ok(guardRead(10, Buffer.from([0x00]))?.includes("Binär"));
  assert.equal(guardRead(10, "hello"), null);
});

test("guardWrite blocks oversized", () => {
  assert.ok(guardWrite(MAX_WRITE_SIZE + 1)?.includes("zu gross"));
  assert.equal(guardWrite(100), null);
});

test("resolveWithinWorkspace allows in-tree paths", () => {
  const r = resolveWithinWorkspace("src/x.ts", "/repo", (p) => p, () => true);
  assert.equal(r.ok, true);
});

test("resolveWithinWorkspace blocks ../ escape", () => {
  const r = resolveWithinWorkspace("../../etc/passwd", "/repo", (p) => p, () => true);
  assert.equal(r.ok, false);
  assert.ok(r.reason?.includes("ausserhalb"));
});

test("resolveWithinWorkspace blocks symlink escape", () => {
  // target resolves (via realpath) to outside the workspace
  const r = resolveWithinWorkspace("link", "/repo", (p) => (p.endsWith("/link") ? "/etc/secret" : p), () => true);
  assert.equal(r.ok, false);
});

test("resolveWithinWorkspace blocks a new file below a symlinked outside parent", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mcli-guard-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  symlinkSync(outside, join(workspace, "link"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = resolveWithinWorkspace("link/new-file.txt", workspace);
  assert.equal(result.ok, false);
  assert.ok(result.reason?.includes("ausserhalb"));
});

test("resolvePatternWithinWorkspace rejects traversal after wildcard components", () => {
  const result = resolvePatternWithinWorkspace("src/**/../../outside/*.ts", "/repo", (p) => p, () => true);
  assert.equal(result.ok, false);
});
