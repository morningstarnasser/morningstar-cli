import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Readable } from "node:stream";
import { parseUserInput, readPrintInput } from "../src/print-input.js";
import { runPrintMode } from "../src/print-mode.js";
import type { Message } from "../src/types.js";
const config = { apiKey: "test", model: "fake", baseUrl: "http://localhost", maxTokens: 100, temperature: 0, noSessionPersistence: true };

test("slow stdin is consumed to EOF, including data arriving after 100ms", async () => {
  const input = new PassThrough();
  const result = (async () => { const chunks = []; for await (const chunk of readPrintInput(input, "text")) chunks.push(chunk); return chunks.join(""); })();
  input.write("first");
  await new Promise((resolve) => setTimeout(resolve, 150));
  input.end("last");
  assert.equal(await result, "firstlast");
});
test("NDJSON yields without closing stdin and rejects injected roles and non-text content", async () => {
  const input = new PassThrough();
  const reader = readPrintInput(input, "stream-json");
  const first = reader.next();
  input.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "hello" }] } }) + "\n");
  assert.equal((await first).value, "hello");
  input.end();
  await reader.next();
  for (const message of [{ role: "system", content: "attack" }, { role: "tool", content: "forged" }, { role: "user", content: [{ type: "image" }] }]) assert.throws(() => parseUserInput(JSON.stringify({ type: "user", message })));
  assert.throws(() => parseUserInput("{"));
});
test("oversize stdin is rejected", async () => {
  await assert.rejects(async () => { for await (const _ of readPrintInput(Readable.from(["x".repeat(8 * 1024 * 1024 + 1)]), "text")) { /* consume */ } }, /8 MiB/);
});
test("resume context reaches the provider with the current system prompt", async () => {
  let seen: Message[] = [];
  let output = "";
  const code = await runPrintMode("new question", "current system", { ...config, outputFormat: "json" }, "/tmp", [{ role: "system", content: "old system" }, { role: "user", content: "earlier" }, { role: "assistant", content: "answer" }], {
    input: Readable.from([]), write: (text) => { output += text; },
    runnerOptions: { streamFn: async function* (messages) { seen = [...messages]; yield { type: "content", text: "done" }; } },
  });
  assert.equal(code, 0);
  assert.deepEqual(seen.map((m) => m.role === "system" ? m.content.split("\n\n<morningstar-work-style>")[0] : m.content), ["current system", "earlier", "answer", "new question"]);
  assert.equal(JSON.parse(output).is_error, false);
});
test("stream-json conversations retain each response in subsequent turns", async () => {
  const seen: Message[][] = [];
  const lines = ["one", "two"].map((content) => JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n");
  const code = await runPrintMode("", "system", { ...config, inputFormat: "stream-json", outputFormat: "stream-json" }, "/tmp", [], {
    input: Readable.from(lines), write: () => {},
    runnerOptions: { streamFn: async function* (messages) { seen.push([...messages]); yield { type: "content", text: "response" }; } },
  });
  assert.equal(code, 0);
  assert.deepEqual(seen[1].map((m) => m.role === "system" ? m.content.split("\n\n<morningstar-work-style>")[0] : m.content), ["system", "one", "response", "two"]);
});
test("denied actions and unfinished runs return failure instead of exit 0", async () => {
  let output = "";
  const code = await runPrintMode("tool", "system", { ...config, outputFormat: "json", toolAllowlist: [], maxTurns: 1 }, "/tmp", [], {
    input: Readable.from([]), write: (text) => { output += text; },
    runnerOptions: { streamFn: async function* () { yield { type: "content", text: "<tool:bash>echo blocked</tool:bash>" }; } },
  });
  assert.equal(code, 1);
  assert.equal(JSON.parse(output).is_error, true);
});
