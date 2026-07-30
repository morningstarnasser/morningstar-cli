import { test } from "node:test";
import assert from "node:assert/strict";
import { pickModelChain, createResilientStream, FALLBACK_MARKER } from "../src/model-fallback.js";
import type { CLIConfig, Message } from "../src/types.js";
import type { StreamToken } from "../src/providers.js";
import type { StreamFn } from "../src/agent-runner.js";

const cfg = (model: string): CLIConfig => ({ apiKey: "k", model, baseUrl: "x", maxTokens: 1, temperature: 0, provider: "p" });
const msgs: Message[] = [{ role: "user", content: "hi" }];

test("chain keeps primary then fallbacks with keys", () => {
  assert.deepEqual(pickModelChain("claude-fable-5", ["deepseek-chat"], (m) => m === "deepseek-chat"), ["deepseek-chat"]);
});

test("chain dedupes and drops keyless models", () => {
  assert.deepEqual(pickModelChain("a", ["a", "b", "c"], (m) => m !== "b"), ["a", "c"]);
});

test("chain keeps primary alone if nothing has a key", () => {
  assert.deepEqual(pickModelChain("only", [], () => false), ["only"]);
});

async function collect(gen: AsyncGenerator<StreamToken>): Promise<string> {
  let out = "";
  for await (const t of gen) if (t.type === "content") out += t.text;
  return out;
}

test("uses primary when it succeeds", async () => {
  const base: StreamFn = async function* (_m, c) { yield { type: "content", text: `from:${c.model}` }; };
  const stream = createResilientStream(["primary", "backup"], cfg, base);
  assert.equal(await collect(stream(msgs, cfg("primary"))), "from:primary");
});

test("falls back transparently and emits a marker", async () => {
  const base: StreamFn = async function* (_m, c) {
    if (c.model === "primary") throw new Error("410 EOL");
    yield { type: "content", text: `from:${c.model}` };
  };
  const fellBack: string[] = [];
  const stream = createResilientStream(["primary", "backup"], cfg, base, (f, n) => fellBack.push(`${f}->${n}`));
  const out = await collect(stream(msgs, cfg("primary")));
  assert.ok(out.includes(FALLBACK_MARKER));
  assert.ok(out.includes("from:backup"));
  assert.deepEqual(fellBack, ["primary->backup"]);
});

test("throws if every model fails", async () => {
  const base: StreamFn = async function* () { throw new Error("boom"); };
  await assert.rejects(() => collect(createResilientStream(["a", "b"], cfg, base)(msgs, cfg("a"))));
});

test("does not double-answer on mid-stream failure", async () => {
  const base: StreamFn = async function* (_m, c) {
    yield { type: "content", text: "partial" };
    if (c.model === "primary") throw new Error("dropped");
  };
  await assert.rejects(() => collect(createResilientStream(["primary", "backup"], cfg, base)(msgs, cfg("primary"))));
});
