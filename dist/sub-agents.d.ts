import type { Message, CLIConfig } from "./types.js";
import { type AgentRunOptions, type NativeToolExecFn, type StreamFn, type TextToolExecFn } from "./agent-runner.js";
export type SubAgentStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export interface SubAgentTask {
    id: string;
    agentId: string;
    description: string;
    status: SubAgentStatus;
    result?: string;
    error?: string;
    toolsUsed: string[];
    tokensUsed: number;
    duration: number;
    startTime: number;
}
export interface SubAgentResult {
    task: SubAgentTask;
    messages: Message[];
    fullResponse: string;
}
export type SubAgentApprovalCallback = NonNullable<AgentRunOptions["onApproval"]>;
/**
 * Optional runner seams shared by direct, sequential, and parallel sub-agent
 * execution. Production callers normally only provide `onApproval`; executor
 * and stream overrides keep the orchestration layer deterministic in tests.
 */
export interface SubAgentExecutionOptions {
    onEvent?: AgentRunOptions["onEvent"];
    onApproval?: SubAgentApprovalCallback;
    streamFn?: StreamFn;
    textToolExecFn?: TextToolExecFn;
    nativeToolExecFn?: NativeToolExecFn;
}
interface ToolExecutorDependencies {
    textToolExecFn?: TextToolExecFn;
    nativeToolExecFn?: NativeToolExecFn;
}
/**
 * Build per-run tool executors for an agent allowlist.
 *
 * This deliberately does not use the legacy process-global agent tool filter:
 * concurrent sub-agents must not overwrite one another's permissions.
 */
export declare function createSubAgentToolExecutors(allowedTools: readonly string[] | undefined, dependencies?: ToolExecutorDependencies): {
    textToolExecFn: TextToolExecFn;
    nativeToolExecFn: NativeToolExecFn;
};
/**
 * Execute a sub-agent task. The sub-agent gets:
 * - Its own agent system prompt
 * - The task description as user message
 * - Access to all tools
 * - Unlimited turns by default; an explicit maxTurns is respected
 *
 * Returns the completed task with results.
 */
export declare function executeSubAgent(agentId: string, taskDescription: string, config: CLIConfig, cwd: string, baseSystemPrompt: string, signal?: AbortSignal, maxTurns?: number, onProgress?: (status: string) => void, options?: SubAgentExecutionOptions): Promise<SubAgentResult>;
/**
 * Execute multiple sub-agent tasks sequentially.
 * Each task can see the results of previous tasks.
 */
export declare function executeSubAgentPipeline(tasks: Array<{
    agentId: string;
    description: string;
}>, config: CLIConfig, cwd: string, baseSystemPrompt: string, signal?: AbortSignal, onProgress?: (taskIdx: number, status: string) => void, options?: SubAgentExecutionOptions): Promise<SubAgentResult[]>;
/**
 * Execute multiple sub-agents truly in parallel. Each task runs concurrently
 * with its own abort signal chained from the parent signal. Progress is
 * reported per-agent as a snapshot array so callers can render a live tree.
 */
export declare function executeSubAgentsParallel(tasks: Array<{
    agentId: string;
    description: string;
}>, config: CLIConfig, cwd: string, baseSystemPrompt: string, signal?: AbortSignal, onSnapshot?: (snapshot: Array<{
    agentId: string;
    status: SubAgentStatus;
    detail: string;
    elapsedMs: number;
}>) => void, options?: SubAgentExecutionOptions): Promise<SubAgentResult[]>;
/**
 * Format sub-agent results for display.
 */
export declare function formatSubAgentResults(results: SubAgentResult[]): string;
/**
 * Get available agents that can be used as sub-agents.
 */
export declare function getAvailableSubAgents(): Array<{
    id: string;
    name: string;
    description: string;
}>;
export {};
//# sourceMappingURL=sub-agents.d.ts.map