import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePermission, evaluateToolAction } from "../src/policy-engine.js";
import { isReadOnlyCommand } from "../src/safety.js";

test("disallowed patterns override allowed patterns and bypass mode", () => {
  const verdict = decidePermission(
    "bash",
    "git status",
    "bypassPermissions",
    ["bash(git:*)"],
    ["bash(git:*)"],
  );

  assert.equal(verdict.decision, "deny");
  assert.match(verdict.reason, /explicitly disallowed/);
  assert.equal(
    decidePermission(
      "bash",
      "git status && rm -rf /tmp/x",
      "bypassPermissions",
      [],
      ["bash(git:*)"],
    ).decision,
    "deny",
  );
});

test("plain tool and wildcard deny patterns match their intended scope", () => {
  assert.equal(decidePermission("read", "secret.txt", "ask", [], ["read"]).decision, "deny");
  assert.equal(decidePermission("write", "notes.txt", "ask", [], ["*"]).decision, "deny");
  assert.equal(decidePermission("edit", "notes.txt", "ask", [], ["read"]).decision, "ask");
});

test("scoped bash patterns support Claude-style command wildcards", () => {
  assert.equal(
    decidePermission("bash", "git status", "ask", ["bash(git:*)"]).decision,
    "allow",
  );
  assert.equal(
    decidePermission("bash", "git", "ask", ["bash(git:*)"]).decision,
    "allow",
  );
  assert.equal(
    decidePermission("bash", "npm test", "ask", ["bash(git:*)"]).decision,
    "ask",
  );
  assert.equal(
    decidePermission("bash", "git status && rm -rf /tmp/x", "ask", ["bash(git:*)"]).decision,
    "ask",
  );
  assert.equal(
    decidePermission("bash", "npm test && rm -rf /tmp/x", "ask", ["bash(npm test*)"]).decision,
    "ask",
  );
  assert.equal(
    decidePermission("bash", "npm test > /tmp/result", "ask", ["bash(npm test*)"]).decision,
    "ask",
  );
  assert.equal(
    decidePermission("read", "git status", "ask", ["bash(git:*)"]).decision,
    "allow",
  );
});

test("plan mode allows reads and denies mutations even when explicitly allowed", () => {
  assert.equal(decidePermission("read", "x.ts", "plan").decision, "allow");
  assert.equal(decidePermission("bash", "ls -la", "plan").decision, "deny");
  assert.equal(decidePermission("bash", "git status", "plan").decision, "deny");

  const write = decidePermission("write", "x.ts", "plan", ["write"]);
  assert.equal(write.decision, "deny");
  assert.equal(write.risk, "medium");
});

test("strict mode asks for every non-denied action, including allowed reads", () => {
  const verdict = decidePermission("read", "x.ts", "strict", ["read"]);
  assert.equal(verdict.decision, "ask");
  assert.equal(verdict.risk, "low");
});

test("ask mode allows proven reads and gates mutating, dangerous, and unknown tools", () => {
  assert.equal(decidePermission("read", "x.ts", "ask").decision, "allow");
  const fetch = decidePermission("fetch", "https://example.com", "ask");
  assert.equal(fetch.decision, "ask");
  assert.equal(fetch.risk, "high");
  assert.equal(decidePermission("bash", "ls -la", "ask").decision, "ask");
  assert.equal(decidePermission("bash", "git status", "ask").decision, "ask");
  assert.equal(decidePermission("write", "x.ts", "ask").decision, "ask");
  assert.equal(decidePermission("bash", "npm publish", "ask").decision, "ask");

  const unknown = decidePermission("future_tool", "anything", "ask");
  assert.equal(unknown.decision, "ask");
  assert.equal(unknown.risk, "high");
});

test("shell reads outside the workspace are never implicitly authorized", () => {
  for (const command of [
    "cat ~/.ssh/id_rsa",
    "head ~/.aws/credentials",
    "tail ~/.config/service/token",
    "grep secret /Users/example/.config/app/config.json",
    "stat /Users/example/.ssh/id_rsa",
    "file /Users/example/.aws/credentials",
    "diff /Users/example/.config/one /Users/example/.config/two",
    "ls /Users/example/.ssh",
  ]) {
    const verdict = decidePermission("bash", command, "ask");
    assert.equal(verdict.decision, "ask", command);
    assert.equal(verdict.risk, "high", command);
  }

  assert.equal(
    decidePermission("bash", "cat ~/.ssh/id_rsa", "ask", ["bash(cat:*)"]).decision,
    "allow",
  );
  assert.equal(decidePermission("read", "src/index.ts", "ask").decision, "allow");
});

test("acceptEdits allows write/edit but still asks for bash and delete", () => {
  assert.equal(decidePermission("write", "x.ts", "acceptEdits").decision, "allow");
  assert.equal(decidePermission("edit", "x.ts", "acceptEdits").decision, "allow");
  assert.equal(decidePermission("bash", "git status", "acceptEdits").decision, "ask");
  assert.equal(decidePermission("bash", "npm test", "acceptEdits").decision, "ask");
  assert.equal(decidePermission("delete", "x.ts", "acceptEdits").decision, "ask");
});

test("dontAsk denies anything that would require approval", () => {
  assert.equal(decidePermission("read", "x.ts", "dontAsk").decision, "allow");
  assert.equal(decidePermission("fetch", "https://example.com", "dontAsk").decision, "deny");
  assert.equal(decidePermission("write", "x.ts", "dontAsk").decision, "deny");
  assert.equal(decidePermission("future_tool", "", "dontAsk").decision, "deny");
  assert.equal(decidePermission("write", "x.ts", "dontAsk", ["write"]).decision, "allow");
});

test("auto and delegate remain fail-closed for non-read-only actions", () => {
  assert.equal(decidePermission("read", "x.ts", "auto").decision, "allow");
  assert.equal(decidePermission("write", "x.ts", "auto").decision, "ask");
  assert.equal(decidePermission("future_tool", "", "delegate").decision, "ask");
});

test("bypass allows actions only when no explicit disallow rule matches", () => {
  assert.equal(decidePermission("delete", "x.ts", "bypassPermissions").decision, "allow");
  assert.equal(
    decidePermission("delete", "x.ts", "bypassPermissions", [], ["delete"]).decision,
    "deny",
  );
});

test("git tool arguments are classified instead of trusting every git action", () => {
  assert.equal(decidePermission("git", "status", "ask").decision, "allow");
  assert.equal(decidePermission("git", "commit -m test", "ask").decision, "ask");

  const destructive = decidePermission("git", "reset --hard HEAD", "ask");
  assert.equal(destructive.decision, "ask");
  assert.equal(destructive.risk, "high");
});

test("legacy evaluateToolAction wrapper keeps read-only and destructive behavior", () => {
  const destructive = evaluateToolAction("bash", "rm -rf /tmp/x");
  assert.equal(destructive.decision, "ask");
  assert.equal(destructive.risk, "high");

  const readOnly = evaluateToolAction("bash", "git status");
  assert.equal(readOnly.decision, "ask");
  assert.equal(readOnly.risk, "high");

  assert.equal(evaluateToolAction("delete", "x.txt").decision, "ask");
  assert.equal(evaluateToolAction("read", "x.txt").decision, "allow");
  assert.equal(evaluateToolAction("vault", "search x").decision, "allow");
  assert.equal(evaluateToolAction("write", "x.ts", true).risk, "medium");
});

test("isReadOnlyCommand recognizes safe inspects and rejects pipes", () => {
  assert.equal(isReadOnlyCommand("ls -la"), true);
  assert.equal(isReadOnlyCommand("git log"), false);
  assert.equal(isReadOnlyCommand("cat f | sh"), false);
  assert.equal(isReadOnlyCommand("rm -rf x"), false);
  assert.equal(isReadOnlyCommand("find . -exec touch /tmp/pwn {} +"), false);
  assert.equal(isReadOnlyCommand("find . -ok chmod 777 {} +"), false);
  assert.equal(isReadOnlyCommand("env touch /tmp/pwn"), false);
  assert.equal(isReadOnlyCommand("git log --output=/tmp/log"), false);
  assert.equal(isReadOnlyCommand("git branch feature"), false);
  assert.equal(isReadOnlyCommand("git remote set-url origin evil"), false);
  assert.equal(isReadOnlyCommand("rg --pre 'touch /tmp/pwn' pattern"), false);
  assert.equal(isReadOnlyCommand("cat /dev/null\ntouch /tmp/pwn"), false);
  assert.equal(isReadOnlyCommand("cat <(touch /tmp/pwn)"), false);
  assert.equal(isReadOnlyCommand("find . '-exec' touch /tmp/pwn {} +"), false);
  assert.equal(isReadOnlyCommand("rg '--pre=touch /tmp/pwn' pattern"), false);
  assert.equal(isReadOnlyCommand("git log '--output=/tmp/log'"), false);
  assert.equal(isReadOnlyCommand("rg --{pre=sh,pre-glob=*.txt} needle ."), false);
  assert.equal(isReadOnlyCommand("rg needle *"), false);
});
