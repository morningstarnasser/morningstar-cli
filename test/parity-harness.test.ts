// Deterministic parity harness — runs every scenario in PARITY_SCENARIOS through
// the real agent loop with mocked provider + tool executor, and asserts the
// declared behavior. TypeScript counterpart to claw-code's mock_parity_harness.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PARITY_SCENARIOS, runParityScenario } from "../src/testing/parity-scenarios.js";
import { createMockProvider, scriptedToolExec, toolOk } from "../src/testing/mock-provider.js";

for (const scenario of PARITY_SCENARIOS) {
  test(`parity: ${scenario.name} — ${scenario.description}`, async () => {
    const { result, requests } = await runParityScenario(scenario);
    const e = scenario.expect;

    if (e.finalTextIncludes !== undefined) {
      assert.ok(
        result.finalText.includes(e.finalTextIncludes),
        `finalText "${result.finalText}" should include "${e.finalTextIncludes}"`,
      );
    }
    if (e.finalTextEquals !== undefined) {
      assert.equal(result.finalText, e.finalTextEquals);
    }
    if (e.turns !== undefined) assert.equal(result.turns, e.turns, "turns");
    if (e.toolCount !== undefined) assert.equal(result.toolCalls.length, e.toolCount, "toolCount");
    if (e.requestCount !== undefined) assert.equal(requests.length, e.requestCount, "requestCount");
    if (e.aborted !== undefined) assert.equal(result.aborted, e.aborted, "aborted");
    if (e.hitTurnLimit !== undefined) assert.equal(result.hitTurnLimit, e.hitTurnLimit, "hitTurnLimit");
  });
}

test("mock provider captures requests in order and is deterministic", async () => {
  const provider = createMockProvider([{ content: "abcdefghijklmnopqrstuvwxyz0123456789" }]);
  const cfg = { model: "m" } as any;
  const out: string[] = [];
  for await (const tok of provider.streamFn([], cfg)) {
    if (tok.type === "content") out.push(tok.text);
  }
  // Content is chunked deterministically (24-char chunks).
  assert.equal(out.join(""), "abcdefghijklmnopqrstuvwxyz0123456789");
  assert.ok(out.length >= 2, "long content is streamed in multiple chunks");
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.callCount(), 1);
});

test("scripted tool exec returns steps in order then empties", async () => {
  const exec = scriptedToolExec([{ results: [toolOk("read", "x")] }]);
  const first = await exec("resp1", "/tmp");
  const second = await exec("resp2", "/tmp");
  assert.equal(first.results.length, 1);
  assert.equal(first.results[0].tool, "read");
  assert.equal(second.results.length, 0, "beyond the script, no tools (loop ends)");
  assert.equal(second.cleanResponse, "resp2");
});
