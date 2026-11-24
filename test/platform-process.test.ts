import { test } from "node:test";
import assert from "node:assert/strict";
import { vendorCommand, bashExecutable, gitExecutable, toolEnvironment } from "../src/runtime/platform-process.js";
import { delimiter } from "node:path";

test("Windows npm CLI uses a known JS entry without shell interpolation", () => {
  const args = ["exec", "--model", "literal & echo unsafe", "C:\\images\\a b.png"];
  const script = "C:\\Users\\User Name\\npm\\node_modules\\@openai\\codex\\bin\\codex.js";
  const result = vendorCommand("codex", args, { platform: "win32", env: { Path: 'C:\\Windows;"C:\\Users\\User Name\\npm"' }, node: "C:\\Node\\node.exe", exists: p => p === script });
  assert.deepEqual(result, { file: "C:\\Node\\node.exe", args: [script, ...args] });
});
test("native vendor executable wins in PATH order; POSIX remains unchanged", () => {
  assert.equal(vendorCommand("claude", ["--version"], { platform: "win32", env: { PATH: "C:\\native;C:\\npm" }, exists: p => p === "C:\\native\\claude.exe" }).file, "C:\\native\\claude.exe");
  assert.deepEqual(vendorCommand("codex", ["--version"], { platform: "darwin" }), { file: "codex", args: ["--version"] });
  assert.equal(vendorCommand("unknown", [], { platform: "win32", exists: () => true }).file, "unknown");
});
test("Windows shell selects Git Bash instead of System32 WSL launcher", () => {
  assert.equal(bashExecutable("win32", { ProgramFiles: "D:\\Programs" }, p => p === "D:\\Programs\\Git\\bin\\bash.exe"), "D:\\Programs\\Git\\bin\\bash.exe");
  assert.equal(bashExecutable("darwin"), "bash");
  assert.equal(gitExecutable("grep", "win32", { ProgramFiles: "D:\\Programs" }, p => p === "D:\\Programs\\Git\\usr\\bin\\grep.exe"), "D:\\Programs\\Git\\usr\\bin\\grep.exe");
});
test("tool PATH uses host delimiter and preserves the existing key and other environment", () => {
  const env = toolEnvironment({ Path: "existing", HOME: "/fixture", KEEP: "yes" });
  assert.equal(env.KEEP, "yes"); assert.ok(env.Path?.endsWith(delimiter + "existing")); assert.equal(env.PATH, undefined);
});
test("private Windows QMD installation is resolved without evaluating a shell shim", () => {
  const script = "C:\\Users\\example\\.morningstar\\tools\\qmd\\node_modules\\@tobilu\\qmd\\bin\\qmd";
  assert.deepEqual(vendorCommand("qmd", ["search", "literal & query"], { platform: "win32", env: { USERPROFILE: "C:\\Users\\example" }, exists: p => p === script, node: "node.exe" }), { file: "node.exe", args: [script, "search", "literal & query"] });
});
