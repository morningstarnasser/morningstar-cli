import { test } from "node:test";
import assert from "node:assert/strict";
import { statusDisplay } from "../src/runtime/status-mcp.js";

test("status display converts uptime and memory units deterministically without changing source data", () => {
  const data = { uptime_seconds: 3425623, mem_used_gb: 17.47, mem_total_gb: 31.35 };
  const before = JSON.stringify(data);
  assert.deepEqual(statusDisplay(data), { uptime: "39 Tage, 15 Stunden, 33 Minuten", memory_used_percent: 55.7 });
  assert.deepEqual(statusDisplay({ uptime_seconds: 90061 }), { uptime: "1 Tag, 1 Stunde, 1 Minute" });
  assert.deepEqual(statusDisplay({ uptime_seconds: 0, mem_used_gb: 0, mem_total_gb: 1 }), { uptime: "0 Tage, 0 Stunden, 0 Minuten", memory_used_percent: 0 });
  assert.equal(JSON.stringify(data), before);
});

test("invalid or unknown-unit measurements never become invented display values", () => {
  for (const uptime_seconds of ["123", -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.deepEqual(statusDisplay({ uptime_seconds }), {});
  for (const [used, total] of [[2, 1], [1, 0], [-1, 5], [NaN, 5], [1, Infinity], ["1", 2]]) assert.deepEqual(statusDisplay({ mem_used_gb: used, mem_total_gb: total }), {});
  assert.deepEqual(statusDisplay({ uptime: 1234, memory: { used: 42 } }), {});
});
