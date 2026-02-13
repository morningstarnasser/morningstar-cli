import type { Message, CLIConfig } from "./types.js";
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
/**
 * Execute a sub-agent task. The sub-agent gets:
 * - Its own agent system prompt
 * - The task description as user message
 * - Access to all tools
 * - A limited number of turns (maxTurns)
 *
 * Returns the completed task with results.
 */
export declare function executeSubAgent(agentId: string, taskDescription: string, config: CLIConfig, cwd: string, baseSystemPrompt: string, signal?: AbortSignal, maxTurns?: number, onProgress?: (status: string) => void): Promise<SubAgentResult>;
/**
 * Execute multiple sub-agent tasks sequentially.
 * Each task can see the results of previous tasks.
 */
export declare function executeSubAgentPipeline(tasks: Array<{
    agentId: string;
    description: string;
}>, config: CLIConfig, cwd: string, baseSystemPrompt: string, signal?: AbortSignal, onProgress?: (taskIdx: number, status: string) => void): Promise<SubAgentResult[]>;
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
//# sourceMappingURL=sub-agents.d.ts.map