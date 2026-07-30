export interface Check {
    name: string;
    command: string;
}
/**
 * Choose verification commands from a package.json scripts map. Pure + testable.
 * Prefers fast checks (typecheck/lint) and includes test/build if present.
 */
export declare function pickChecks(scripts: Record<string, string>): Check[];
/** Detect checks for a project directory (reads package.json). */
export declare function detectChecks(cwd: string): Check[];
export interface CheckResult {
    name: string;
    ok: boolean;
    output: string;
}
/** Run all detected checks and a git diff summary. Returns per-check results. */
export declare function verifyProject(cwd: string, timeoutMs?: number): {
    checks: CheckResult[];
    diff: string;
};
/** Render a compact verification report for Telegram. */
export declare function formatVerification(result: {
    checks: CheckResult[];
    diff: string;
}): string;
//# sourceMappingURL=verification.d.ts.map