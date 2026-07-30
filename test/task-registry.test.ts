import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskRegistry } from "../src/task-registry.js";

test("creates and retrieves tasks", () => {
  const r = new TaskRegistry(() => 1);
  const t = r.create("build the thing");
  assert.equal(t.status, "pending");
  assert.equal(r.get(t.id)?.title, "build the thing");
});

test("lists and filters by status", () => {
  const r = new TaskRegistry();
  const a = r.create("a");
  r.create("b");
  r.setStatus(a.id, "running");
  assert.equal(r.list().length, 2);
  assert.deepEqual(r.list("running").map((t) => t.title), ["a"]);
});

test("appends output and updates status", () => {
  const r = new TaskRegistry();
  const t = r.create("x");
  r.appendOutput(t.id, "hello ");
  r.appendOutput(t.id, "world");
  assert.equal(r.get(t.id)?.output, "hello world");
  r.setStatus(t.id, "done");
  assert.equal(r.get(t.id)?.status, "done");
});

test("stop transitions running → stopped but leaves done alone", () => {
  const r = new TaskRegistry();
  const t = r.create("x", "running");
  assert.equal(r.stop(t.id)?.status, "stopped");
  const d = r.create("y", "done");
  assert.equal(r.stop(d.id)?.status, "done");
});

test("unknown id returns undefined", () => {
  assert.equal(new TaskRegistry().get("nope"), undefined);
});
