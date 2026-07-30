// ─── Cron Scheduler (Hermes-style autonomous jobs) ───────────────────────────
// Scheduled prompts that run the headless agent and push the result to a
// Telegram chat. Supports standard 5-field cron expressions and an "@every <n>"
// interval form. Jobs persist to ~/.morningstar/cron.json.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const STORE_DIR = join(homedir(), ".morningstar");
const STORE_FILE = join(STORE_DIR, "cron.json");
const FIELD_BOUNDS = [
    [0, 59], // minute
    [0, 23], // hour
    [1, 31], // day of month
    [1, 12], // month
    [0, 6], // day of week (0 = Sunday)
];
/** Parse one cron field into the set of matching integers. Throws on garbage. */
function parseField(field, [min, max]) {
    const values = new Set();
    for (const part of field.split(",")) {
        const [rangePart, stepPart] = part.split("/");
        const step = stepPart ? Number(stepPart) : 1;
        if (!Number.isInteger(step) || step < 1)
            throw new Error(`Invalid step in "${field}"`);
        let lo = min;
        let hi = max;
        if (rangePart !== "*") {
            const [a, b] = rangePart.split("-");
            lo = Number(a);
            hi = b !== undefined ? Number(b) : lo;
            if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
                throw new Error(`Invalid range "${rangePart}" in "${field}"`);
            }
        }
        for (let v = lo; v <= hi; v += step)
            values.add(v);
    }
    return values;
}
/** Parse "@every 5m"/"30s"/"2h" into milliseconds, or null if not an interval. */
export function parseInterval(schedule) {
    const m = schedule.trim().match(/^@every\s+(\d+)\s*([smh])$/i);
    if (!m)
        return null;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const mult = unit === "s" ? 1000 : unit === "m" ? 60000 : 3600000;
    return n * mult;
}
/**
 * Does a standard 5-field cron expression match the given date (to the minute)?
 * Pure + exported for testing. Day-of-month and day-of-week use cron's OR
 * semantics when both are restricted.
 */
export function cronMatches(schedule, date) {
    const fields = schedule.trim().split(/\s+/);
    if (fields.length !== 5)
        throw new Error(`Cron expression must have 5 fields: "${schedule}"`);
    const sets = fields.map((f, i) => parseField(f, FIELD_BOUNDS[i]));
    const [minutes, hours, doms, months, dows] = sets;
    const minuteOk = minutes.has(date.getMinutes());
    const hourOk = hours.has(date.getHours());
    const monthOk = months.has(date.getMonth() + 1);
    if (!minuteOk || !hourOk || !monthOk)
        return false;
    const domRestricted = fields[2] !== "*";
    const dowRestricted = fields[4] !== "*";
    const domOk = doms.has(date.getDate());
    const dowOk = dows.has(date.getDay());
    if (domRestricted && dowRestricted)
        return domOk || dowOk;
    return domOk && dowOk;
}
/** Validate a schedule string up front. Returns an error message or null. */
export function validateSchedule(schedule) {
    if (parseInterval(schedule) !== null)
        return null;
    if (/^@every/i.test(schedule))
        return 'Interval form must look like "@every 5m" (s/m/h).';
    try {
        cronMatches(schedule, new Date(0));
        return null;
    }
    catch (e) {
        return e.message;
    }
}
/**
 * Given the current minute (and the per-job lastRun), return the jobs that
 * should fire now. Pure + exported for testing.
 */
export function dueJobs(jobs, now) {
    const nowMs = now.getTime();
    const minuteStart = nowMs - (now.getSeconds() * 1000 + now.getMilliseconds());
    return jobs.filter((job) => {
        if (!job.enabled)
            return false;
        const intervalMs = parseInterval(job.schedule);
        if (intervalMs !== null) {
            return job.lastRun === undefined || nowMs - job.lastRun >= intervalMs;
        }
        // Cron: match the minute and ensure we haven't already fired this minute.
        let matches = false;
        try {
            matches = cronMatches(job.schedule, now);
        }
        catch {
            return false;
        }
        if (!matches)
            return false;
        return job.lastRun === undefined || job.lastRun < minuteStart;
    });
}
// ─── Persistence ─────────────────────────────────────────────────────────────
export function loadJobs() {
    try {
        if (existsSync(STORE_FILE))
            return JSON.parse(readFileSync(STORE_FILE, "utf-8"));
    }
    catch {
        /* corrupt → empty */
    }
    return [];
}
export function saveJobs(jobs) {
    if (!existsSync(STORE_DIR))
        mkdirSync(STORE_DIR, { recursive: true });
    writeFileSync(STORE_FILE, JSON.stringify(jobs, null, 2), "utf-8");
}
function genId() {
    return Math.random().toString(36).slice(2, 10);
}
export function addJob(input) {
    const err = validateSchedule(input.schedule);
    if (err)
        throw new Error(err);
    const job = { ...input, id: genId(), enabled: input.enabled ?? true, createdAt: Date.now() };
    saveJobs([...loadJobs(), job]);
    return job;
}
export function removeJob(id) {
    const jobs = loadJobs();
    const next = jobs.filter((j) => j.id !== id);
    if (next.length === jobs.length)
        return false;
    saveJobs(next);
    return true;
}
export function setJobEnabled(id, enabled) {
    const jobs = loadJobs();
    const job = jobs.find((j) => j.id === id);
    if (!job)
        return null;
    saveJobs(jobs.map((j) => (j.id === id ? { ...j, enabled } : j)));
    return { ...job, enabled };
}
export function recordRun(id, when = Date.now()) {
    const jobs = loadJobs();
    saveJobs(jobs.map((j) => (j.id === id ? { ...j, lastRun: when } : j)));
}
export const CRON_STORE_PATH = STORE_FILE;
//# sourceMappingURL=scheduler.js.map