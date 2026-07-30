import { type AgentRunOptions, type StreamFn } from "./agent-runner.js";
import type { CLIConfig, Message } from "./types.js";
export interface AgentTask {
    label: string;
    prompt: string;
}
export interface AgentTaskResult {
    label: string;
    text: string;
    tools: number;
    ok: boolean;
}
/**
 * Parse a free-text block into discrete tasks. One per line; if a single line,
 * split on ";". Leading bullets/numbers are stripped. Pure + testable.
 */
export declare function parseTasks(text: string): AgentTask[];
export interface RunParallelOptions {
    maxTurns?: number;
    signal?: AbortSignal;
    streamFn?: StreamFn;
    onApproval?: AgentRunOptions["onApproval"];
    buildMessages: (prompt: string) => Message[];
}
/**
 * Run all tasks concurrently. Capped at MAX_TASKS — extra tasks are dropped (the
 * caller is told). Each task that throws yields an ok:false result instead of
 * failing the whole batch.
 */
export declare function runParallel(tasks: AgentTask[], config: CLIConfig, cwd: string, options: RunParallelOptions): Promise<{
    results: AgentTaskResult[];
    dropped: number;
}>;
/** Render aggregated results into one Telegram message. */
export declare function formatParallelResults(results: AgentTaskResult[], dropped: number): string;
//# sourceMappingURL=parallel-agents.d.ts.map