export interface CronJob {
    id: string;
    name: string;
    /** "min hour dom month dow" OR "@every 5m" / "@every 30s" / "@every 2h". */
    schedule: string;
    /** Prompt fed to the agent when the job fires. */
    prompt: string;
    /** Working directory for the run. */
    cwd: string;
    /** Telegram chat the result is sent to. */
    chatId: number;
    enabled: boolean;
    lastRun?: number;
    createdAt: number;
}
/** Parse "@every 5m"/"30s"/"2h" into milliseconds, or null if not an interval. */
export declare function parseInterval(schedule: string): number | null;
/**
 * Does a standard 5-field cron expression match the given date (to the minute)?
 * Pure + exported for testing. Day-of-month and day-of-week use cron's OR
 * semantics when both are restricted.
 */
export declare function cronMatches(schedule: string, date: Date): boolean;
/** Validate a schedule string up front. Returns an error message or null. */
export declare function validateSchedule(schedule: string): string | null;
/**
 * Given the current minute (and the per-job lastRun), return the jobs that
 * should fire now. Pure + exported for testing.
 */
export declare function dueJobs(jobs: CronJob[], now: Date): CronJob[];
export declare function loadJobs(): CronJob[];
export declare function saveJobs(jobs: CronJob[]): void;
export declare function addJob(input: Omit<CronJob, "id" | "createdAt" | "enabled"> & {
    enabled?: boolean;
}): CronJob;
export declare function removeJob(id: string): boolean;
export declare function setJobEnabled(id: string, enabled: boolean): CronJob | null;
export declare function recordRun(id: string, when?: number): void;
export declare const CRON_STORE_PATH: string;
//# sourceMappingURL=scheduler.d.ts.map