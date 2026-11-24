import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectMemory, appendProjectMemory } from "../src/project-memory.js";
test("AGENTS wins over CLAUDE and appending memory never changes either", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "morningstar-guidance-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, "CLAUDE.md"), "claude-rule");
  assert.match(loadProjectMemory(cwd)!, /claude-rule/);
  writeFileSync(join(cwd, "AGENTS.md"), "agents-rule");
  assert.match(loadProjectMemory(cwd)!, /agents-rule/);
  assert.doesNotMatch(loadProjectMemory(cwd)!, /claude-rule/);
  assert.equal(appendProjectMemory(cwd, "new"), false);
  writeFileSync(join(cwd, "MORNINGSTAR.md"), "memory");
  assert.equal(appendProjectMemory(cwd, "new"), true);
  assert.equal(readFileSync(join(cwd, "AGENTS.md"), "utf8"), "agents-rule");
});
test("project guidance ignores symlinks and oversized files", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "morningstar-guidance-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, "outside"), "secret");
  symlinkSync(join(cwd, "outside"), join(cwd, "AGENTS.md"));
  writeFileSync(join(cwd, "CLAUDE.md"), "x".repeat(131073));
  assert.equal(loadProjectMemory(cwd), null);
});
