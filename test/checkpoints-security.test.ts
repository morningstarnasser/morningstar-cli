import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deleteCheckpoint,
  isValidCheckpointId,
  loadCheckpoint,
  validateCheckpoint,
} from "../src/checkpoints.js";

test("checkpoint IDs reject traversal and shell fragments", () => {
  assert.equal(isValidCheckpointId("mabc1234"), true);
  for (const id of ["../config", "/tmp/x", "a/b", "x;touch-pwn", "", "." ]) {
    assert.equal(isValidCheckpointId(id), false, id);
    assert.equal(loadCheckpoint(id), null);
    assert.equal(deleteCheckpoint(id), false);
  }
});

test("checkpoint payload validation rejects injected git refs and malformed messages", () => {
  const base = {
    id: "safe-id",
    name: "Safe",
    timestamp: new Date().toISOString(),
    cwd: "/tmp",
    messages: [{ role: "user", content: "hello" }],
  };
  assert.ok(validateCheckpoint(base, "safe-id"));
  assert.equal(
    validateCheckpoint({ ...base, gitRef: "HEAD; touch /tmp/pwn" }, "safe-id"),
    null,
  );
  assert.equal(
    validateCheckpoint({ ...base, messages: [{ role: "root", content: 3 }] }, "safe-id"),
    null,
  );
});
