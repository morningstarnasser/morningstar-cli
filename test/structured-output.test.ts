import { test } from "node:test";
import assert from "node:assert/strict";
import { createOutputValidator } from "../src/structured-output.js";
import { runAgent } from "../src/agent-runner.js";
import { printExitCode } from "../src/print-mode.js";
const schema = JSON.stringify({ type: "object", properties: { count: { type: "integer", minimum: 0 } }, required: ["count"], additionalProperties: false });
test("JSON Schema validates constraints without coercing or stripping data", () => {
  const validate = createOutputValidator(schema);
  assert.deepEqual(validate('{"count":2}'), { value: { count: 2 } });
  for (const invalid of ['{"count":"2"}', '{"count":-1}', '{"count":2,"other":1}', '{}', 'not json']) assert.ok(validate(invalid).error);
});
test("unknown schemas and remote refs are rejected without network access", () => {
  assert.throws(() => createOutputValidator('{"$ref":"https://example.com/schema"}'));
  assert.throws(() => createOutputValidator('{"$async":true}'));
  assert.throws(() => createOutputValidator('{"invented":true}'));
});
test("shared runner enforces schema and print returns failure on mismatch", async () => {
  const config = { apiKey: "test", model: "fake", baseUrl: "http://localhost", maxTokens: 100, temperature: 0, jsonSchema: schema };
  let instructions = "";
  const result = await runAgent([{ role: "user", content: "count" }], config, "/tmp", { streamFn: async function* (messages) { instructions = messages[0].content; yield { type: "content", text: '{"count":"wrong"}' }; } });
  assert.match(instructions, /JSON Schema/);
  assert.match(result.structuredOutputError!, /integer/);
  assert.equal(printExitCode(result), 1);
  let calls = 0;
  await assert.rejects(() => runAgent([], { ...config, jsonSchema: '{"invented":true}' }, "/tmp", { streamFn: async function* () { calls++; } }));
  assert.equal(calls, 0);
});
