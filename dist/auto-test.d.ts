export interface TestRunnerConfig {
    name: string;
    command: string;
    args: string[];
    testFilePattern?: RegExp;
}
export interface AutoTestResult {
    runner: string;
    command: string;
    passed: boolean;
    output: string;
    duration: number;
    testFile?: string;
}
export interface AutoTestPlan {
    runner: string;
    executable: string;
    args: string[];
    command: string;
    testFile?: string;
}
export type AutoTestPlanner = (cwd: string, testFile?: string) => AutoTestPlan | null;
/**
 * Detect the test runner for a project.
 */
export declare function detectTestRunner(cwd: string): TestRunnerConfig | null;
/**
 * Find the test file that corresponds to a source file.
 * e.g., src/utils.ts -> src/utils.test.ts or __tests__/utils.test.ts
 */
export declare function findTestFile(sourceFile: string, cwd: string): string | null;
/** Resolve the exact argv that would execute, without starting repository code. */
export declare function planTestRun(cwd: string, testFile?: string): AutoTestPlan | null;
/**
 * Preserve the agent runner's allowlist semantics for implicit test runs.
 * An omitted or empty allowlist is unrestricted; a populated allowlist must
 * explicitly include Bash before repository-controlled test code is planned.
 */
export declare function planAgentTestRun(cwd: string, testFile: string | undefined, toolAllowlist: readonly string[] | undefined, planner?: AutoTestPlanner): AutoTestPlan | null;
/** Execute one previously displayed and authorized test plan. */
export declare function runTestPlan(cwd: string, plan: AutoTestPlan, timeout?: number): AutoTestResult;
/**
 * Backward-compatible helper. Interactive callers should authorize
 * `planTestRun().command` before invoking `runTestPlan`.
 */
export declare function runTests(cwd: string, testFile?: string, timeout?: number): AutoTestResult | null;
/**
 * Determine if auto-test should run for a given file change.
 * Returns the test file to run, or null if no tests should run.
 */
export declare function shouldAutoTest(changedFile: string, cwd: string): {
    runAll: boolean;
    testFile: string | null;
};
/**
 * Format test result for display.
 */
export declare function formatTestResult(result: AutoTestResult): string;
//# sourceMappingURL=auto-test.d.ts.map