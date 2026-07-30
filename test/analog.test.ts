import { test } from "node:test";
import assert from "node:assert/strict";
import type { ToolExecFn } from "../src/agent-runner.js";
import type { CLIConfig, Message } from "../src/types.js";
import { createMockProvider } from "../src/testing/mock-provider.js";
import {
  isReadOnlyTool,
  filterReadOnlyToolDefinitions,
  createAnalogToolExec,
  formatAuditLine,
  runAnalog,
  READ_ONLY_TOOLS,
  type AnalogAuditEvent,
} from "../src/runtime/analog.js";

test("read-only tool set classifies tools", () => {
  assert.equal(isReadOnlyTool("read"), true);
  assert.equal(isReadOnlyTool("grep"), true);
  assert.equal(isReadOnlyTool("write"), false);
  assert.equal(isReadOnlyTool("bash"), false);
  assert.equal(isReadOnlyTool("delete"), false);
});

test("filterReadOnlyToolDefinitions drops mutating tools", () => {
  const defs = filterReadOnlyToolDefinitions();
  const names = defs.map((d) => d.function.name);
  assert.ok(names.includes("read"));
  assert.ok(names.includes("grep"));
  assert.ok(!names.includes("write"));
  assert.ok(!names.includes("bash"));
  assert.ok(!names.includes("delete"));
  for (const n of names) assert.ok(READ_ONLY_TOOLS.has(n), `${n} should be read-only`);
});

// A fake base executor: records what response text it received, "executes" any
// read tool tag it sees, never touches the filesystem.
function fakeExec(received: string[]): ToolExecFn {
  return async (response: string) => {
    received.push(response);
    const results = response.includes("<tool:read>")
      ? [{ tool: "read", result: "file contents", success: true }]
      : [];
    return { results, cleanResponse: response };
  };
}

test("analog tool exec strips mutating calls before execution", async () => {
  const received: string[] = [];
  const audit: AnalogAuditEvent[] = [];
  const exec = createAnalogToolExec(fakeExec(received), { onAudit: (e) => audit.push(e), clock: () => 0 });

  const response = "do this <tool:read>f.txt</tool> and <tool:write>x</tool>";
  const out = await exec(response, "/tmp");

  // The base executor must NOT have seen the write tag.
  assert.ok(!received[0].includes("<tool:write>"), "write tag stripped before base exec");
  assert.ok(received[0].includes("<tool:read>"), "read tag preserved");

  // Read ran (success), write is reported blocked (failure).
  const read = out.results.find((r) => r.tool === "read");
  const write = out.results.find((r) => r.tool === "write");
  assert.equal(read?.success, true);
  assert.equal(write?.success, false);
  assert.match(write?.result ?? "", /not allowed in read-only analog mode/);

  // Audit recorded both decisions.
  assert.ok(audit.some((e) => e.kind === "tool_allowed" && e.tool === "read"));
  assert.ok(audit.some((e) => e.kind === "tool_blocked" && e.tool === "write"));
});

test("formatAuditLine produces valid NDJSON", () => {
  const line = formatAuditLine({ ts: 123, kind: "tool_blocked", tool: "bash", detail: "x" });
  const parsed = JSON.parse(line);
  assert.equal(parsed.ts, 123);
  assert.equal(parsed.kind, "tool_blocked");
  assert.equal(parsed.tool, "bash");
});

test("runAnalog blocks mutating tools across the full loop and audits start/end", async () => {
  // Turn 1: model tries to write. Turn 2: model gives up and answers.
  const provider = createMockProvider([
    { content: "I will <tool:write>danger</tool> now" },
    { content: "Could not modify anything (read-only)." },
  ]);
  const config = { model: "mock" } as CLIConfig;
  const seed: Message[] = [{ role: "user", content: "please edit" } as Message];

  const { result, audit } = await runAnalog(seed, config, "/tmp", {
    streamFn: provider.streamFn,
    baseExec: fakeExec([]),
    clock: () => 7,
    maxTurns: 5,
  });

  // The write was blocked, surfaced as a failed tool result.
  const blocked = result.toolCalls.find((t) => t.tool === "write");
  assert.equal(blocked?.success, false);
  assert.ok(result.finalText.includes("read-only"));

  // Audit trail brackets the run.
  assert.equal(audit[0].kind, "start");
  assert.equal(audit[audit.length - 1].kind, "end");
  assert.ok(audit.some((e) => e.kind === "tool_blocked" && e.tool === "write"));
  // Every event is NDJSON-serializable.
  for (const e of audit) assert.doesNotThrow(() => JSON.parse(formatAuditLine(e)));
});
