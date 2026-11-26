import { test } from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { TelegramApiError } from "../src/telegram/api.js";
import { TelegramPollingRecovery, waitForTelegramRetry } from "../src/telegram/polling-recovery.js";

test("persistent outages back off, rate-limit warnings and announce recovery once", () => {
  let now = 0; const recovery = new TelegramPollingRecovery(() => now);
  const error = new TypeError("https://api.telegram.org/botDO-NOT-LOG", { cause: Object.assign(new Error("private details"), { code: "ECONNRESET" }) });
  const delays: number[] = [], notices: string[] = [];
  for (let i = 0; i < 12; i++) {
    const result = recovery.failure(error); delays.push(result.delayMs);
    if (result.notice) notices.push(result.notice);
    assert.equal(result.fatal, false); now += 1000;
  }
  assert.deepEqual(delays.slice(0, 7), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  assert.equal(notices.length, 1); assert.match(notices[0], /ECONNRESET/);
  assert.doesNotMatch(JSON.stringify(recovery.state) + notices[0], /DO-NOT-LOG|private details|https:/);
  now = 63000; assert.ok(recovery.failure(error).notice);
  assert.match(recovery.success()!, /wieder erreichbar/);
  assert.equal(recovery.success(), undefined);
  assert.equal(recovery.state.status, "connected");
  assert.equal(recovery.state.consecutiveFailures, 0);
  assert.equal(recovery.state.nextRetryAt, undefined);
  assert.equal(recovery.failure(error).delayMs, 1000);
});

test("Telegram retry_after is honored while token and consumer errors stop", () => {
  const recovery = new TelegramPollingRecovery(() => 1000);
  const limited = recovery.failure(new TelegramApiError(429, "Conflict in arbitrary server description", 37));
  assert.equal(limited.fatal, false); assert.equal(limited.delayMs, 37000);
  assert.equal(recovery.state.nextRetryAt, 38000); assert.match(limited.notice!, /Ratenlimit/);
  for (const status of [400, 401, 403, 404, 409]) {
    const decision = new TelegramPollingRecovery().failure(new TelegramApiError(status, "private-url"));
    assert.equal(decision.fatal, true); assert.equal(decision.delayMs, 0);
    assert.doesNotMatch(decision.notice!, /private-url/);
  }
});

test("stopping cancels a pending retry immediately and removes its listener", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController(); let finished = false;
  const pending = waitForTelegramRetry(60000, controller.signal).then(() => { finished = true; });
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  controller.abort(); await pending;
  assert.equal(finished, true); assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  t.mock.timers.tick(60000);
  await waitForTelegramRetry(60000, controller.signal);
});
