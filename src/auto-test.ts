// ─── Auto-Test: Detect and run tests after file changes ──
// Detects the test runner for the project and runs relevant tests
// after file modifications (write/edit).

import { existsSync, readFileSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { spawnSync } from "node:child_process";

// ─── Types ───────────────────────────────────────────────

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

// ─── Test Runner Detection ───────────────────────────────

const TEST_RUNNERS: Array<{
  name: string;
  detect: (cwd: string) => boolean;
  config: (cwd: string) => TestRunnerConfig;
}> = [
  {
    name: "vitest",
    detect: (cwd) => {
      if (existsSync(join(cwd, "vitest.config.ts")) || existsSync(join(cwd, "vitest.config.js"))) return true;
      try {
        const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
        return !!(pkg.devDependencies?.vitest || pkg.dependencies?.vitest);
      } catch { return false; }
    },
    config: () => ({ name: "vitest", command: "npx", args: ["vitest", "run", "--reporter=verbose"], testFilePattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/ }),
  },
  {
    name: "jest",
    detect: (cwd) => {
      if (existsSync(join(cwd, "jest.config.ts")) || existsSync(join(cwd, "jest.config.js"))) return true;
      try {
        const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
        return !!(pkg.devDependencies?.jest || pkg.dependencies?.jest || pkg.jest);
      } catch { return false; }
    },
    config: () => ({ name: "jest", command: "npx", args: ["jest", "--verbose", "--no-coverage"], testFilePattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/ }),
  },
  {
    name: "pytest",
    detect: (cwd) => {
      return existsSync(join(cwd, "pytest.ini")) || existsSync(join(cwd, "setup.cfg")) || existsSync(join(cwd, "pyproject.toml"));
    },
    config: () => ({ name: "pytest", command: "pytest", args: ["-v", "--tb=short"], testFilePattern: /test_.*\.py$|.*_test\.py$/ }),
  },
  {
    name: "cargo test",
    detect: (cwd) => existsSync(join(cwd, "Cargo.toml")),
    config: () => ({ name: "cargo", command: "cargo", args: ["test"], testFilePattern: undefined }),
  },
  {
    name: "go test",
    detect: (cwd) => existsSync(join(cwd, "go.mod")),
    config: () => ({ name: "go", command: "go", args: ["test", "./..."], testFilePattern: /_test\.go$/ }),
  },
  {
    name: "npm test",
    detect: (cwd) => {
      try {
        const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
        return !!pkg.scripts?.test && pkg.scripts.test !== "echo \"Error: no test specified\" && exit 1";
      } catch { return false; }
    },
    config: () => ({ name: "npm test", command: "npm", args: ["test", "--", "--passWithNoTests"], testFilePattern: undefined }),
  },
];

/**
 * Detect the test runner for a project.
 */
export function detectTestRunner(cwd: string): TestRunnerConfig | null {
  for (const runner of TEST_RUNNERS) {
    if (runner.detect(cwd)) {
      return runner.config(cwd);
    }
  }
  return null;
}

/**
 * Find the test file that corresponds to a source file.
 * e.g., src/utils.ts -> src/utils.test.ts or __tests__/utils.test.ts
 */
export function findTestFile(sourceFile: string, cwd: string): string | null {
  const base = basename(sourceFile, extname(sourceFile));
  const dir = dirname(sourceFile);
  const ext = extname(sourceFile);

  // Common test file locations
  const candidates = [
    join(dir, `${base}.test${ext}`),
    join(dir, `${base}.spec${ext}`),
    join(dir, "__tests__", `${base}.test${ext}`),
    join(dir, "__tests__", `${base}.spec${ext}`),
    join(cwd, "tests", `${base}.test${ext}`),
    join(cwd, "tests", `${base}.spec${ext}`),
    join(cwd, "test", `${base}.test${ext}`),
    join(cwd, "test", `${base}.spec${ext}`),
    // Python style
    join(dir, `test_${base}${ext}`),
    join(cwd, "tests", `test_${base}${ext}`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Run tests for a specific file or the whole project.
 */
export function runTests(
  cwd: string,
  testFile?: string,
  timeout: number = 60000,
): AutoTestResult | null {
  const runner = detectTestRunner(cwd);
  if (!runner) return null;

  const startTime = Date.now();
  const args = [...runner.args];

  // If a specific test file is provided, add it to the command
  if (testFile) {
    if (runner.name === "vitest" || runner.name === "jest") {
      args.push(testFile);
    } else if (runner.name === "pytest") {
      args.push(testFile);
    } else if (runner.name === "go") {
      // Go test with specific file requires package path
      const dir = dirname(testFile);
      args[1] = `./${dir}/...`;
    }
  }

  const fullCommand = `${runner.command} ${args.join(" ")}`;

  try {
    const result = spawnSync(runner.command, args, {
      cwd,
      encoding: "utf-8",
      timeout,
      env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
    });

    const output = ((result.stdout || "") + (result.stderr || "")).trim();
    const duration = Date.now() - startTime;

    return {
      runner: runner.name,
      command: fullCommand,
      passed: result.status === 0,
      output: output.length > 3000 ? output.slice(-3000) : output,
      duration,
      testFile: testFile || undefined,
    };
  } catch (e) {
    return {
      runner: runner.name,
      command: fullCommand,
      passed: false,
      output: `Fehler: ${(e as Error).message}`,
      duration: Date.now() - startTime,
      testFile: testFile || undefined,
    };
  }
}

/**
 * Determine if auto-test should run for a given file change.
 * Returns the test file to run, or null if no tests should run.
 */
export function shouldAutoTest(changedFile: string, cwd: string): { runAll: boolean; testFile: string | null } {
  const runner = detectTestRunner(cwd);
  if (!runner) return { runAll: false, testFile: null };

  const ext = extname(changedFile).toLowerCase();

  // Skip non-code files
  const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".kt", ".rb", ".php"]);
  if (!codeExtensions.has(ext)) return { runAll: false, testFile: null };

  // If the changed file IS a test file, run it directly
  if (runner.testFilePattern && runner.testFilePattern.test(changedFile)) {
    return { runAll: false, testFile: changedFile };
  }

  // Find corresponding test file
  const testFile = findTestFile(changedFile, cwd);
  if (testFile) {
    return { runAll: false, testFile };
  }

  // Config files changed -> run all tests
  const configFiles = ["package.json", "tsconfig.json", "pyproject.toml", "Cargo.toml", "go.mod"];
  if (configFiles.some(cf => changedFile.endsWith(cf))) {
    return { runAll: true, testFile: null };
  }

  return { runAll: false, testFile: null };
}

/**
 * Format test result for display.
 */
export function formatTestResult(result: AutoTestResult): string {
  const icon = result.passed ? "\u2714" : "\u2718";
  const status = result.passed ? "PASSED" : "FAILED";
  const duration = result.duration >= 1000
    ? `${(result.duration / 1000).toFixed(1)}s`
    : `${result.duration}ms`;

  const lines: string[] = [
    `${icon} Auto-Test [${result.runner}] ${status} (${duration})`,
  ];

  if (result.testFile) {
    lines.push(`  Datei: ${result.testFile}`);
  }

  // Show last few lines of output
  const outputLines = result.output.split("\n").filter(l => l.trim());
  const relevantLines = outputLines.slice(-8);
  if (relevantLines.length > 0) {
    lines.push("  " + relevantLines.join("\n  "));
  }

  return lines.join("\n");
}
