import type { ToolInvocation } from "../agent-runner.js";
import type { ToolResult } from "../types.js";
export declare function displayText(text: string): string;
export interface ChangeLine {
    kind: "context" | "added" | "removed";
    text: string;
    line: number;
}
export interface FileChange {
    added: number;
    removed: number;
    lines: ChangeLine[];
    omitted: number;
    coarse: boolean;
}
/** Bounded LCS with common edges removed; huge replacements use a valid coarse diff. */
export declare function fileChange(before: string, after: string, startLine?: number, previewLimit?: number): FileChange;
/** Attach invocation metadata even when a policy denial never reached the executor. */
export declare function workResult(invocation: ToolInvocation, result: ToolResult): ToolResult;
export declare function workHeading(r: ToolResult): string;
/** Group adjacent fast edits without delaying commands or mixing worker identities. */
export declare function createWorkLogBatcher(emit: (agent: string, results: ToolResult[]) => void, delayMs?: number): {
    push(owner: string, result: ToolResult): void;
    flush: () => void;
    cancel(): void;
};
//# sourceMappingURL=work-log.d.ts.map