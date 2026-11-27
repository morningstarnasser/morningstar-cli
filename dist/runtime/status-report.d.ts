import type { ToolResult } from "../types.js";
/** Render recognized measured snapshots for short, direct status requests.
 * Failed/mixed/unsupported reads and analytical questions keep their normal
 * answer path; this is a formatter, not an inference about unmeasured hosts. */
export declare function measuredStatusReport(task: string, results: ToolResult[]): string | undefined;
//# sourceMappingURL=status-report.d.ts.map