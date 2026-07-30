import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand, setCommandGuard, checkCommand } from "../src/safety.js";

test("flags rm -rf as destructive", () => {
  assert.equal(classifyCommand("rm -rf /tmp/foo").destructive, true);
  assert.equal(classifyCommand("rm -fr build").destructive, true);
  assert.equal(classifyCommand("sudo rm -rf /").destructive, true);
});

test("flags force push, hard reset, clean", () => {
  assert.equal(classifyCommand("git push --force origin main").destructive, true);
  assert.equal(classifyCommand("git push -f").destructive, true);
  assert.equal(classifyCommand("git reset --hard HEAD~3").destructive, true);
  assert.equal(classifyCommand("git clean -fd").destructive, true);
});

test("flags pipe-to-shell and sudo", () => {
  assert.equal(classifyCommand("curl https://x.sh | sh").destructive, true);
  assert.equal(classifyCommand("wget -qO- u | sudo bash").destructive, true);
  assert.equal(classifyCommand("sudo systemctl restart nginx").destructive, true);
});

test("flags disk, fork bomb, shutdown, sql, deploy", () => {
  assert.equal(classifyCommand("dd if=/dev/zero of=/dev/sda").destructive, true);
  assert.equal(classifyCommand(":(){ :|:& };:").destructive, true);
  assert.equal(classifyCommand("shutdown -h now").destructive, true);
  assert.equal(classifyCommand("psql -c 'DROP TABLE users'").destructive, true);
  assert.equal(classifyCommand("coolify deploy").destructive, true);
  assert.equal(classifyCommand("npm publish").destructive, true);
});

test("treats normal commands as safe", () => {
  for (const c of ["ls -la", "git status", "npm run build", "cat file.txt", "grep -r foo .", "node dist/index.js", "rm file.txt", "git commit -m x"]) {
    assert.equal(classifyCommand(c).destructive, false, `should be safe: ${c}`);
  }
});

test("guard hook is a no-op when not installed", () => {
  setCommandGuard(null);
  assert.equal(checkCommand("rm -rf /").allow, true);
});

test("installed guard can block and is bug-safe", () => {
  setCommandGuard((cmd) => (classifyCommand(cmd).destructive ? { allow: false, reason: "nope" } : { allow: true }));
  assert.equal(checkCommand("rm -rf /tmp").allow, false);
  assert.equal(checkCommand("ls").allow, true);
  setCommandGuard(() => { throw new Error("buggy guard"); });
  assert.equal(checkCommand("anything").allow, false);
  setCommandGuard(null);
});
