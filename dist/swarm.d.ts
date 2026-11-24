import { type NativeToolExecFn } from "./agent-runner.js";
import { type SubAgentExecutionOptions, type SubAgentResult, type SubAgentStatus } from "./sub-agents.js";
import type { CLIConfig } from "./types.js";
export interface SwarmTask {
    id: string;
    agentId: string;
    description: string;
    dependsOn: string[];
    /** Empty means read-only. Literal workspace-relative paths, never globs. */
    writePaths: string[];
    /** Shell/build tools require the entire workspace to be idle. */
    exclusive: boolean;
}
export interface SwarmPlan {
    title: string;
    concurrency: number;
    tasks: SwarmTask[];
}
export interface SwarmBranch {
    taskId: string;
    agentId: string;
    status: SubAgentStatus;
    detail: string;
    elapsedMs: number;
}
export interface SwarmOptions extends SubAgentExecutionOptions {
    initialCostUsd?: number;
    onTaskEvent?: (task: SwarmTask, event: Parameters<NonNullable<SubAgentExecutionOptions["onEvent"]>>[0]) => void;
}
export declare function validateSwarmPlan(raw: unknown, cwd: string, agents?: Record<string, import("./agents.js").Agent>): SwarmPlan;
export declare function swarmTasksConflict(a: SwarmTask, b: SwarmTask, cwd: string): boolean;
/** Enforced on both text and native calls, in addition to the normal policy. */
export declare function createSwarmExecutor(task: SwarmTask, cwd: string, execute?: NativeToolExecFn): NativeToolExecFn;
export declare function prepareSwarmPlan(input: string, config: CLIConfig, cwd: string, system: string, signal?: AbortSignal, options?: SubAgentExecutionOptions): Promise<SwarmPlan>;
export declare function runSwarm(plan: SwarmPlan, config: CLIConfig, cwd: string, system: string, signal?: AbortSignal, onSnapshot?: (state: SwarmBranch[]) => void, options?: SwarmOptions): Promise<SubAgentResult[]>;
//# sourceMappingURL=swarm.d.ts.map