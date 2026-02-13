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
/**
 * Detect the test runner for a project.
 */
export declare function detectTestRunner(cwd: string): TestRunnerConfig | null;
/**
 * Find the test file that corresponds to a source file.
 * e.g., src/utils.ts -> src/utils.test.ts or __tests__/utils.test.ts
 */
export declare function findTestFile(sourceFile: string, cwd: string): string | null;
/**
 * Run tests for a specific file or the whole project.
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