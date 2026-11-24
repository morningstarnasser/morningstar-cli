import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Message } from "../src/types.js";
import {
  buildCodexArgs,
  buildCodexPrompt,
  codexCliStream,
  codexCatalogPath,
  parseCodexCatalog,
  parseCodexEvent,
  type CodexRunner,
} from "../src/providers/codex-cli.js";
import {
  buildCodexCliModels,
  detectProvider,
  getModelDisplayName,
  resolveModelName,
} from "../src/providers.js";

const m = (role: Message["role"], content: string): Message => ({ role, content });

test("detectProvider routes codex-cli before the openai codex rule", () => {
  assert.equal(detectProvider("codex-cli"), "codex-cli");
  assert.equal(detectProvider("codex-cli/gpt-5.2"), "codex-cli");
  // A plain codex model still routes to the OpenAI API provider.
  assert.equal(detectProvider("codex-mini"), "openai");
});

test("resolveModelName extracts the codex alias", () => {
  assert.equal(resolveModelName("codex-cli", "codex-cli"), "");
  assert.equal(resolveModelName("codex-cli/gpt-5.2", "codex-cli"), "gpt-5.2");
});

test("getModelDisplayName labels codex-cli as a subscription", () => {
  assert.match(getModelDisplayName("codex-cli"), /Abo/);
});

test("buildCodexArgs runs non-interactive, read-only and JSON", () => {
  const args = buildCodexArgs();
  assert.equal(args[0], "exec");
  assert.ok(args.includes("--json"));
  assert.deepEqual(
    args.slice(args.indexOf("--sandbox"), args.indexOf("--sandbox") + 2),
    ["--sandbox", "read-only"],
  );
  assert.ok(args.includes("--ignore-user-config"), "user MCP servers stay out of the run");
  assert.ok(!args.includes("--model"));
});

test("buildCodexArgs adds the model when one is given", () => {
  const args = buildCodexArgs("gpt-5.2");
  assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2), ["--model", "gpt-5.2"]);
});

test("buildCodexPrompt prepends the system prompt as an instruction block", () => {
  const prompt = buildCodexPrompt([m("system", "be morningstar"), m("user", "hi")]);
  assert.equal(prompt, "be morningstar\n\n---\n\nhi");
});

test("buildCodexPrompt renders a labeled transcript for multi-turn", () => {
  const prompt = buildCodexPrompt([m("user", "first"), m("assistant", "ok"), m("user", "second")]);
  assert.equal(prompt, "User: first\n\nAssistant: ok\n\nUser: second");
});

test("parseCodexEvent keeps only assistant messages", () => {
  assert.equal(
    parseCodexEvent('{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"OK"}}'),
    "OK",
  );
  assert.equal(parseCodexEvent('{"type":"turn.started"}'), null);
  assert.equal(
    parseCodexEvent('{"type":"item.completed","item":{"id":"i0","type":"error","message":"boom"}}'),
    null,
    "codex-internal errors never leak into the model output",
  );
  assert.equal(parseCodexEvent("2026-07-30T04:13:54Z ERROR rmcp::transport"), null);
  assert.equal(parseCodexEvent(""), null);
  assert.equal(parseCodexEvent("{not json"), null);
});

test("codexCliStream reassembles JSONL split across chunks", async () => {
  let seenArgs: string[] = [];
  let seenPrompt = "";
  const fakeRunner: CodexRunner = async function* (args, prompt) {
    seenArgs = args;
    seenPrompt = prompt;
    yield '{"type":"turn.started"}\n{"type":"item.completed","item":{"type":"agent_m';
    yield 'essage","text":"Hallo"}}\n';
  };
  const tokens: string[] = [];
  for await (const token of codexCliStream("gpt-5.2", [m("user", "yo")], undefined, fakeRunner)) {
    assert.equal(token.type, "content");
    tokens.push(token.text);
  }
  assert.deepEqual(tokens, ["Hallo"]);
  assert.equal(seenPrompt, "yo");
  assert.ok(seenArgs.includes("gpt-5.2"));
});

test("codexCliStream emits a trailing line without a newline", async () => {
  const fakeRunner: CodexRunner = async function* () {
    yield '{"type":"item.completed","item":{"type":"agent_message","text":"tail"}}';
  };
  const tokens: string[] = [];
  for await (const token of codexCliStream(undefined, [m("user", "x")], undefined, fakeRunner)) {
    tokens.push(token.text);
  }
  assert.deepEqual(tokens, ["tail"]);
});

test("codexCliStream stops once the signal is aborted", async () => {
  const controller = new AbortController();
  const fakeRunner: CodexRunner = async function* () {
    yield '{"type":"item.completed","item":{"type":"agent_message","text":"first"}}\n';
    controller.abort();
    yield '{"type":"item.completed","item":{"type":"agent_message","text":"second"}}\n';
  };
  const tokens: string[] = [];
  for await (const token of codexCliStream(undefined, [m("user", "x")], controller.signal, fakeRunner)) {
    tokens.push(token.text);
  }
  assert.deepEqual(tokens, ["first"]);
});

// ─── Model catalog ───────────────────────────────────────────────────────────

const CATALOG = JSON.stringify({
  fetched_at: "2026-07-30T05:11:31Z",
  models: [
    { slug: "gpt-5.6-luna", display_name: "GPT-5.6-Luna", description: "Fast", visibility: "list", priority: 3 },
    { slug: "gpt-5.6-sol", display_name: "GPT-5.6-Sol", description: "Frontier", visibility: "list", priority: 1 },
    { slug: "codex-auto-review", display_name: "Codex Auto Review", visibility: "hide", priority: 43 },
    { slug: "gpt-5.4", display_name: "GPT-5.4", visibility: "list", priority: 16 },
  ],
});

test("catalog is ordered by the vendor's own priority", () => {
  assert.deepEqual(
    parseCodexCatalog(CATALOG).map((model) => model.slug),
    ["gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.4"],
  );
});

test("hidden models never become selectable", () => {
  // codex-auto-review is the internal approval reviewer, not a chat model.
  const slugs = parseCodexCatalog(CATALOG).map((model) => model.slug);
  assert.ok(!slugs.includes("codex-auto-review"));
});

test("catalog keeps the vendor display names", () => {
  const sol = parseCodexCatalog(CATALOG).find((model) => model.slug === "gpt-5.6-sol");
  assert.equal(sol?.displayName, "GPT-5.6-Sol");
});

test("a broken or foreign catalog degrades to nothing, never throws", () => {
  assert.deepEqual(parseCodexCatalog("{not json"), []);
  assert.deepEqual(parseCodexCatalog("{}"), []);
  assert.deepEqual(parseCodexCatalog(JSON.stringify({ models: "nope" })), []);
  assert.deepEqual(parseCodexCatalog(JSON.stringify({ models: [null, 3, {}] })), []);
  const partial = parseCodexCatalog(JSON.stringify({ models: [{ slug: "x" }] }));
  assert.deepEqual(partial, [{ slug: "x", displayName: "x", description: "" }]);
});

test("subscription list keeps the CLI default first", () => {
  const models = buildCodexCliModels(parseCodexCatalog(CATALOG));
  assert.equal(models[0], "codex-cli", "the CLI default stays selectable");
  assert.deepEqual(models.slice(1), [
    "codex-cli/gpt-5.6-sol",
    "codex-cli/gpt-5.6-luna",
    "codex-cli/gpt-5.4",
  ]);
});

test("an empty catalog still yields a usable provider", () => {
  assert.deepEqual(buildCodexCliModels([]), ["codex-cli"]);
});

test("catalog models route and resolve like the claude subscription", () => {
  assert.equal(detectProvider("codex-cli/gpt-5.6-sol"), "codex-cli");
  assert.equal(resolveModelName("codex-cli/gpt-5.6-sol", "codex-cli"), "gpt-5.6-sol");
});

test("CODEX_HOME overrides the catalog location", () => {
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = "/tmp/codex-home-test";
  try {
    assert.equal(codexCatalogPath(), join("/tmp/codex-home-test", "models_cache.json"));
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
  }
});
