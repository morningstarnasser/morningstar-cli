import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTasks, runParallel, formatParallelResults } from "../src/parallel-agents.js";
import type { CLIConfig, Message } from "../src/types.js";
import type { StreamFn } from "../src/agent-runner.js";
import type { StreamToken } from "../src/providers.js";

test("parses one task per line, stripping bullets", () => {
  const tasks = parseTasks("1. fix the build\n2) write tests\n- update docs");
  assert.deepEqual(tasks.map((t) => t.prompt), ["fix the build", "write tests", "update docs"]);
});

test("splits a single line on semicolons", () => {
  assert.equal(parseTasks("lint; typecheck; test").length, 3);
});

test("truncates long labels", () => {
  const [t] = parseTasks("x".repeat(50));
  assert.ok(t.label.endsWith("…"));
  assert.equal(t.prompt.length, 50);
});

const cfg: CLIConfig = { apiKey: "k", model: "m", baseUrl: "x", maxTokens: 1, temperature: 0, provider: "p" };

const echo: StreamFn = async function* (messages: Message[]): AsyncGenerator<StreamToken> {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  yield { type: "content", text: `done: ${last}` };
};

const buildMessages = (p: string): Message[] => [{ role: "system", content: "sys" }, { role: "user", content: p }];

test("runs tasks concurrently and returns one result each", async () => {
  const { results, dropped } = await runParallel(parseTasks("alpha\nbeta\ngamma"), cfg, "/tmp", { streamFn: echo, buildMessages });
  assert.equal(dropped, 0);
  assert.equal(results.length, 3);
  assert.ok(results.find((r) => r.text === "done: alpha"));
  assert.ok(results.find((r) => r.text === "done: gamma"));
});

test("caps at 5 tasks and reports dropped", async () => {
  const tasks = parseTasks(Array.from({ length: 8 }, (_, i) => `task ${i}`).join("\n"));
  const { results, dropped } = await runParallel(tasks, cfg, "/tmp", { streamFn: echo, buildMessages });
  assert.equal(results.length, 5);
  assert.equal(dropped, 3);
});

test("a failing task does not sink the batch", async () => {
  const boom: StreamFn = async function* (messages: Message[]): AsyncGenerator<StreamToken> {
    const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    if (last.includes("bad")) throw new Error("kaboom");
    yield { type: "content", text: "ok" };
  };
  const { results } = await runParallel(parseTasks("good\nbad"), cfg, "/tmp", { streamFn: boom, buildMessages });
  assert.equal(results.length, 2);
  assert.ok(results.some((r) => !r.ok));
  assert.ok(results.some((r) => r.ok));
});

test("threads approval callbacks through each parallel agent run", async () => {
  const responses = [
    "<tool:write>out.txt\nvalue</tool>",
    "done",
  ];
  const approvalTools: string[] = [];
  const streamFn: StreamFn = async function* () {
    yield { type: "content", text: responses.shift() ?? "done" };
  };

  const { results } = await runParallel(
    parseTasks("one task"),
    { ...cfg, permissionMode: "ask" },
    "/tmp",
    {
      streamFn,
      buildMessages,
      onApproval: async (request) => {
        approvalTools.push(request.invocation.name);
        return false;
      },
    },
  );

  assert.deepEqual(approvalTools, ["write"]);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].text, "done");
  assert.equal(results[0].tools, 1);
});

test("passes an abort signal into parallel agent runs", async () => {
  const controller = new AbortController();
  controller.abort();

  const { results } = await runParallel(parseTasks("cancel me"), cfg, "/tmp", {
    signal: controller.signal,
    streamFn: echo,
    buildMessages,
  });

  assert.equal(results[0].ok, false);
  assert.equal(results[0].text, "Abgebrochen.");
  assert.equal(results[0].tools, 0);
});

test("formats aggregated results", () => {
  const out = formatParallelResults([{ label: "a", text: "x", tools: 2, ok: true }], 1);
  assert.ok(out.includes("parallele Agenten"));
  assert.ok(out.includes("verworfen"));
});
