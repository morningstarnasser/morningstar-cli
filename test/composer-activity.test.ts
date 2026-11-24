import { test } from "node:test";
import assert from "node:assert/strict";
import { bounds, selectedText, moveCursor, stepCursor, replaceSelection, erase } from "../src/runtime/composer.js";
import { updateActivity } from "../src/runtime/activity.js";
import { motionEnabled } from "../src/runtime/motion.js";
import type { AgentLifecycleEvent, ToolInvocation } from "../src/agent-runner.js";

test("selection grows both ways, collapses on plain arrows and replaces only its range", () => {
  const original = { value: "hello world", cursor: 5, anchor: null };
  const selected = moveCursor(moveCursor(original, -1, true), -1, true);
  assert.equal(selectedText(selected), "lo");
  assert.deepEqual(bounds(selected), [3, 5]);
  assert.deepEqual(replaceSelection(selected, "p"), { value: "help world", cursor: 4, anchor: null });
  assert.equal(moveCursor(selected, -1).cursor, 3);
  assert.equal(moveCursor(selected, 1).cursor, 5);
  assert.equal(selectedText(moveCursor(original, 1, true, true)), " world");
});

test("emoji, combining characters and flags stay whole under movement and deletion", () => {
  for (const grapheme of ["👩🏽‍💻", "🇨🇭", "e\u0301", "💫"]) {
    const value = `a${grapheme}b`;
    assert.equal(stepCursor(value, 1, 1), 1 + grapheme.length);
    assert.equal(stepCursor(value, 1 + grapheme.length, -1), 1);
    assert.equal(erase({ value, cursor: 1 + grapheme.length, anchor: null }).value, "ab");
    assert.equal(erase({ value, cursor: 1, anchor: null }, true).value, "ab");
  }
});

test("multi-line paste preserves text and strips terminal control sequences", () => {
  const state = replaceSelection({ value: "old", cursor: 3, anchor: 0 }, "A\r\nB\x1b[31m\x00");
  assert.equal(state.value, "A\nB");
  assert.equal(state.cursor, 3);
});

test("selection deletes cleanly and empty boundaries do not move", () => {
  assert.deepEqual(erase({ value: "abc", cursor: 0, anchor: 3 }), { value: "", cursor: 0, anchor: null });
  assert.equal(stepCursor("", 0, -1), 0);
  assert.equal(stepCursor("", 0, 1), 0);
  assert.equal(erase({ value: "abc", cursor: 0, anchor: null }).value, "abc");
});

test("startup motion respects TTY, CI, no-color and reduced-motion settings", () => {
  assert.equal(motionEnabled({}, true), true);
  for (const env of [{ CI: "1" }, { TERM: "dumb" }, { NO_COLOR: "" }, { MORNINGSTAR_REDUCED_MOTION: "1" }]) assert.equal(motionEnabled(env, true), false);
  assert.equal(motionEnabled({}, false), false);
});

test("activity separates agents with same invocation ID and tracks approval and duration", () => {
  const invocation = { id: "same", name: "write", args: { filePath: "src/a.ts", content: "SECRET_BODY_NOT_IN_TIMELINE" }, source: "native" } as ToolInvocation;
  const requested = { type: "tool_requested", turn: 1, invocation } as AgentLifecycleEvent;
  let state = updateActivity([], "a", requested, 100);
  state = updateActivity(state, "b", requested, 200);
  state = updateActivity(state, "a", { type: "approval_required", request: { invocation } } as AgentLifecycleEvent, 250);
  assert.equal(state[0].status, "waiting"); assert.equal(state[1].status, "running");
  state = updateActivity(state, "a", { type: "tool_result", turn: 1, invocation, result: { tool: "write", success: true, result: "private output" } }, 600);
  assert.equal(state[0].status, "completed"); assert.equal(state[0].duration, 500);
  assert.equal(state[1].status, "running");
  assert.ok(!JSON.stringify(state).includes("SECRET")); assert.ok(!JSON.stringify(state).includes("private output"));
  const untouched = updateActivity(state, "a", { type: "reasoning_delta", turn: 1, delta: "private reasoning" });
  assert.equal(untouched, state);
});

test("activity closes unfinished tools on cancellation and bounds long sessions", () => {
  let state = updateActivity([], "a", { type: "tool_requested", turn: 1, invocation: { id: "x", name: "bash", args: {}, source: "text" } }, 10);
  state = updateActivity(state, "a", { type: "completion", result: { aborted: true } } as AgentLifecycleEvent, 100);
  assert.equal(state[0].status, "cancelled"); assert.equal(state[0].duration, 90);
  for (let i = 0; i < 300; i++) state = updateActivity(state, "a", { type: "tool_requested", turn: i, invocation: { id: String(i), name: "read", args: {}, source: "text" } });
  assert.equal(state.length, 200);
});
