import { test } from "node:test";
import assert from "node:assert/strict";
import { cronMatches, parseInterval, validateSchedule, dueJobs, type CronJob } from "../src/scheduler.js";

function at(h: number, m: number, day = 15, month = 5, year = 2026): Date {
  return new Date(year, month, day, h, m, 0, 0);
}

test("matches a daily morning cron", () => {
  assert.equal(cronMatches("0 8 * * *", at(8, 0)), true);
  assert.equal(cronMatches("0 8 * * *", at(8, 1)), false);
  assert.equal(cronMatches("0 8 * * *", at(9, 0)), false);
});

test("matches step expressions", () => {
  assert.equal(cronMatches("*/15 * * * *", at(10, 0)), true);
  assert.equal(cronMatches("*/15 * * * *", at(10, 15)), true);
  assert.equal(cronMatches("*/15 * * * *", at(10, 7)), false);
});

test("matches ranges and lists", () => {
  assert.equal(cronMatches("0 9-17 * * *", at(12, 0)), true);
  assert.equal(cronMatches("0 9-17 * * *", at(18, 0)), false);
  assert.equal(cronMatches("0 8,20 * * *", at(20, 0)), true);
});

test("rejects malformed cron expressions", () => {
  assert.throws(() => cronMatches("0 8 * *", new Date()));
  assert.throws(() => cronMatches("99 8 * * *", new Date()));
});

test("parses interval schedules", () => {
  assert.equal(parseInterval("@every 30s"), 30000);
  assert.equal(parseInterval("@every 5m"), 300000);
  assert.equal(parseInterval("@every 2h"), 7200000);
  assert.equal(parseInterval("0 8 * * *"), null);
  assert.equal(parseInterval("@every 5x"), null);
});

test("validateSchedule accepts good and rejects bad", () => {
  assert.equal(validateSchedule("0 8 * * *"), null);
  assert.equal(validateSchedule("@every 10m"), null);
  assert.notEqual(validateSchedule("nonsense"), null);
});

function job(over: Partial<CronJob>): CronJob {
  return { id: "j", name: "n", schedule: "@every 5m", prompt: "p", cwd: "/tmp", chatId: 1, enabled: true, createdAt: 0, ...over };
}

test("interval job is due when never run", () => {
  assert.equal(dueJobs([job({ schedule: "@every 5m" })], at(10, 0)).length, 1);
});

test("interval job not due before its interval elapses", () => {
  const now = at(10, 0);
  assert.equal(dueJobs([job({ schedule: "@every 5m", lastRun: now.getTime() - 60000 })], now).length, 0);
});

test("interval job due again after its interval", () => {
  const now = at(10, 0);
  assert.equal(dueJobs([job({ schedule: "@every 5m", lastRun: now.getTime() - 6 * 60000 })], now).length, 1);
});

test("cron job fires once per matching minute", () => {
  const now = at(8, 0);
  assert.equal(dueJobs([job({ schedule: "0 8 * * *" })], now).length, 1);
  assert.equal(dueJobs([job({ schedule: "0 8 * * *", lastRun: now.getTime() + 100 })], now).length, 0);
});

test("disabled jobs never fire", () => {
  assert.equal(dueJobs([job({ enabled: false })], at(10, 0)).length, 0);
});
