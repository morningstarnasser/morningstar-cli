import { test } from "node:test";
import assert from "node:assert/strict";
import type { Message } from "../src/types.js";
import {
  buildClaudePrompt,
  buildClaudeArgs,
  claudeCliStream,
  DISABLED_CLAUDE_CODE_TOOLS,
  type ClaudeRunner,
} from "../src/providers/claude-cli.js";
import { detectProvider, resolveModelName, getModelDisplayName } from "../src/providers.js";

const m = (role: Message["role"], content: string): Message => ({ role, content });

test("detectProvider routes claude-cli before anthropic / openrouter", () => {
  assert.equal(detectProvider("claude-cli"), "claude-cli");
  assert.equal(detectProvider("claude-cli/opus"), "claude-cli");
  // plain claude-* still routes to the anthropic API provider
  assert.equal(detectProvider("claude-opus-4-8"), "anthropic");
});

test("resolveModelName extracts the alias", () => {
  assert.equal(resolveModelName("claude-cli", "claude-cli"), "");
  assert.equal(resolveModelName("claude-cli/opus", "claude-cli"), "opus");
  assert.equal(resolveModelName("claude-cli/haiku", "claude-cli"), "haiku");
});

test("getModelDisplayName has friendly claude-cli labels", () => {
  assert.match(getModelDisplayName("claude-cli"), /Claude Code/);
  assert.match(getModelDisplayName("claude-cli/opus"), /Opus/);
});

test("buildClaudePrompt: single user message is the prompt; system extracted", () => {
  const { system, prompt } = buildClaudePrompt([m("system", "be carry"), m("user", "hi")]);
  assert.equal(system, "be carry");
  assert.equal(prompt, "hi");
});

test("buildClaudePrompt: multi-turn renders a labeled transcript", () => {
  const { prompt } = buildClaudePrompt([
    m("user", "first"),
    m("assistant", "ok"),
    m("user", "second"),
  ]);
  assert.equal(prompt, "User: first\n\nAssistant: ok\n\nUser: second");
});

test("buildClaudeArgs runs print mode, disables Claude Code tools, sets model+system", () => {
  const args = buildClaudeArgs("opus", "SYS");
  assert.ok(args.includes("-p"));
  assert.deepEqual(args.slice(args.indexOf("--output-format"), args.indexOf("--output-format") + 2), ["--output-format", "text"]);
  assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2), ["--model", "opus"]);
  assert.deepEqual(args.slice(args.indexOf("--system-prompt"), args.indexOf("--system-prompt") + 2), ["--system-prompt", "SYS"]);
  const disallow = args[args.indexOf("--disallowedTools") + 1];
  for (const t of DISABLED_CLAUDE_CODE_TOOLS) assert.ok(disallow.includes(t), `${t} disabled`);
});

test("buildClaudeArgs omits --model when alias is empty (Claude default)", () => {
  const args = buildClaudeArgs(undefined, "SYS");
  assert.ok(!args.includes("--model"));
});

test("claudeCliStream yields content tokens from the runner and passes args", async () => {
  let seenArgs: string[] = [];
  let seenPrompt = "";
  const fakeRunner: ClaudeRunner = async function* (args, prompt) {
    seenArgs = args;
    seenPrompt = prompt;
    yield "Hello ";
    yield "from Claude.";
  };
  const tokens: string[] = [];
  for await (const t of claudeCliStream("sonnet", [m("system", "S"), m("user", "yo")], undefined, fakeRunner)) {
    assert.equal(t.type, "content");
    tokens.push(t.text);
  }
  assert.equal(tokens.join(""), "Hello from Claude.");
  assert.equal(seenPrompt, "yo");
  assert.ok(seenArgs.includes("--model") && seenArgs.includes("sonnet"));
  assert.ok(seenArgs.includes("--system-prompt"));
});

test("claudeCliStream stops emitting once the signal is aborted", async () => {
  const ac = new AbortController();
  const fakeRunner: ClaudeRunner = async function* () {
    yield "first";
    ac.abort();
    yield "second";
  };
  const tokens: string[] = [];
  for await (const t of claudeCliStream(undefined, [m("user", "x")], ac.signal, fakeRunner)) {
    tokens.push(t.text);
  }
  assert.deepEqual(tokens, ["first"]);
});
