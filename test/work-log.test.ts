import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileChange, displayText, workHeading, workResult, createWorkLogBatcher, workMetadata, workPreview } from "../src/runtime/work-log.js";
import { writeFile, editFile, deleteFile, bash } from "../src/tools.js";
import { deletionKey, erase } from "../src/runtime/composer.js";

test("file diffs count actual changes, preserve line numbers, support empty additions/deletions", () => {
  const diff = fileChange("keep\nold\nlast\n", "keep\nnew\nmore\nlast\n");
  assert.equal(diff.added, 2); assert.equal(diff.removed, 1);
  assert.deepEqual(diff.lines.filter(l => l.kind !== "context").map(l => [l.kind, l.line, l.text]), [["removed", 2, "old"], ["added", 2, "new"], ["added", 3, "more"]]);
  assert.equal(fileChange("", "one\n").added, 1);
  assert.equal(fileChange("one\n", "").removed, 1);
  assert.equal(fileChange("\n", "").removed, 1);
  assert.equal(fileChange("a\nb", "a\nb").lines.length, 0);
});

test("large diffs bound computation and preview while counting the whole replaced region", () => {
  const old = Array.from({ length: 3000 }, (_, i) => `old${i}`).join("\n");
  const next = old.replaceAll("old", "new");
  const diff = fileChange(old, next);
  assert.equal(diff.coarse, true); assert.equal(diff.added, 3000); assert.equal(diff.removed, 3000);
  assert.equal(diff.lines.length, 28); assert.equal(diff.omitted, 5972);
  const localized = fileChange(old, old.replace("old1500", "changed"));
  assert.equal(localized.coarse, false); assert.equal(localized.added, 1); assert.equal(localized.removed, 1);
  assert.ok(localized.lines.some(l => l.kind === "added" && l.line === 1501));
});

test("real file tools carry before/after evidence including replace-all and deletion", () => {
  const cwd = mkdtempSync(join(tmpdir(), "morningstar-worklog-"));
  try {
    const created = writeFile("a.ts", "const old = 1;\nconst old2 = 2;\n", cwd);
    assert.equal(fileChange(created.diff!.oldStr, created.diff!.newStr).added, 2);
    const edited = editFile("a.ts", "old", "new", cwd, true);
    assert.equal(edited.diff!.newStr, readFileSync(join(cwd, "a.ts"), "utf8"));
    const change = fileChange(edited.diff!.oldStr, edited.diff!.newStr);
    assert.equal(change.added, 2); assert.equal(change.removed, 2);
    const removed = deleteFile("a.ts", cwd);
    assert.equal(fileChange(removed.diff!.oldStr, removed.diff!.newStr).removed, 2);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("commands report real success and nonzero exit codes, preserving command and output", async () => {
  const success = await bash("printf 'PASS'", tmpdir());
  assert.equal(success.exitCode, 0); assert.equal(success.result, "PASS");
  const failed = await bash("printf 'TEST_FAILED' >&2; exit 7", tmpdir());
  assert.equal(failed.success, false); assert.equal(failed.exitCode, 7); assert.equal(failed.result, "TEST_FAILED");
  assert.match(workHeading(failed), /^Exited \(status 7\).*exit 7$/);
  const denied = workResult({ id: "x", name: "bash", source: "native", args: { command: "echo denied" } }, { tool: "bash", success: false, result: "denied" });
  assert.equal(workHeading(denied), "Failed echo denied");
  assert.equal(displayText("\x1b[2Jhello\x1b]52;c;secret\x07\n+code"), "hello\n+code");
});

test("Mac DEL deletes backwards without selection; terminal forward Delete stays distinct", () => {
  const key = { backspace: false, delete: true, ctrl: false, meta: false };
  const backspace = deletionKey("\x7f", key, "")!;
  assert.equal(backspace.forward, false);
  assert.equal(erase({ value: "abc", cursor: 3, anchor: null }, backspace.forward).value, "ab");
  const forward = deletionKey("\x1b[3~", key, "")!;
  assert.equal(forward.forward, true);
  assert.equal(erase({ value: "abc", cursor: 1, anchor: null }, forward.forward).value, "ac");
  assert.equal(deletionKey("\x7f\x7f", key, "")!.count, 2);
  assert.equal(deletionKey("\b", { ...key, backspace: true }, "")!.forward, false);
  assert.equal(deletionKey("\x1b\x7f", { ...key, meta: true }, "")!.word, true);
  assert.equal(deletionKey("d", { ...key, delete: false, ctrl: true }, "d")!.forward, true);
  assert.equal(deletionKey("hello", { ...key, delete: false }, "hello"), null);
});

test("adjacent edits group by worker and flush before commands without reordering", () => {
  const emitted: Array<[string, string[]]> = [];
  const batch = createWorkLogBatcher((agent, results) => emitted.push([agent, results.map(r => r.filePath ?? r.tool)]));
  const edit = (filePath: string) => ({ tool: "edit", success: true, result: "done", filePath, diff: { filePath, oldStr: "a", newStr: "b" } });
  batch.push("api", edit("a.ts")); batch.push("api", edit("b.ts"));
  assert.equal(emitted.length, 0);
  batch.push("docs", edit("README.md"));
  batch.push("docs", { tool: "bash", success: true, result: "ok", exitCode: 0 });
  assert.deepEqual(emitted, [["api", ["a.ts", "b.ts"]], ["docs", ["README.md"]], ["docs", ["bash"]]]);
  batch.cancel();
});


test("work previews count hidden lines exactly and never invent timing or exit codes", () => {
  const preview = workPreview("a\r\nb\r\nc\r\nd\r\ne\r\n");
  assert.deepEqual(preview, { lines: ["a", "b", "c", "d"], omitted: 1 });
  assert.deepEqual(workPreview(""), { lines: [], omitted: 0 });
  const result = { tool: "bash", command: "echo done", result: "done", success: true };
  assert.equal(workMetadata(result), "");
  assert.equal(workMetadata({ ...result, durationMs: 1250, exitCode: 0 }), "1.3s · Exit 0");
  assert.equal(workMetadata({ ...result, durationMs: Number.NaN, exitCode: 7 }), "Exit 7");
  assert.equal(workHeading({ ...result, exitCode: 0 }), "Ran echo done");
});
