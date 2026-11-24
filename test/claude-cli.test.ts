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
import {
  buildClaudeCliModels,
  detectProvider,
  getModelDisplayName,
  listProviders,
  resolveModelName,
} from "../src/providers.js";

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
  assert.equal(args[args.indexOf("--tools") + 1], "", "all built-in tools, including future ones, are disabled");
  assert.equal(args[args.indexOf("--disallowedTools") + 1], "mcp__*", "external tools remain disabled too");
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

test("the subscription lists the full Anthropic catalog, not just the aliases", () => {
  // Regression: /model showed only claude-cli + three aliases, which read as
  // "the models did not load". `claude -p --model claude-fable-5` is valid.
  const models = buildClaudeCliModels(["claude-fable-5", "claude-opus-5"]);
  assert.ok(models.includes("claude-cli"), "the CLI default stays first");
  assert.ok(models.includes("claude-cli/opus"), "short aliases remain");
  assert.ok(models.includes("claude-cli/claude-fable-5"));
  assert.ok(models.includes("claude-cli/claude-opus-5"));
});

test("subscription model lists contain no duplicates and no placeholders", () => {
  const models = buildClaudeCliModels(["claude-fable-5", "(Modell-ID manuell eingeben)"]);
  assert.equal(new Set(models).size, models.length);
  assert.ok(!models.some((model) => model.includes("(")));
});

test("subscription models are routed and labelled through the hosted catalog", () => {
  assert.equal(detectProvider("claude-cli/claude-fable-5"), "claude-cli");
  assert.equal(resolveModelName("claude-cli/claude-fable-5", "claude-cli"), "claude-fable-5");
  const label = getModelDisplayName("claude-cli/claude-fable-5");
  assert.match(label, /Abo/);
  assert.ok(!label.startsWith("claude-cli/"), "not the raw id");
});

test("the subscription catalog offers vendor aliases without guessed model IDs", () => {
  const entry = listProviders().find((provider) => provider.name === "claude-cli");
  assert.ok(entry);
  assert.deepEqual(entry.models, ["claude-cli", "claude-cli/opus", "claude-cli/sonnet", "claude-cli/haiku"]);
});
