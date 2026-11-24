import type { AgentLifecycleEvent, AgentRunOptions } from "./agent-runner.js";
import type { CLIConfig, Message, ToolResult } from "./types.js";
import type { UsageData } from "./providers.js";
import type { SwarmBranch, SwarmPlan } from "./swarm.js";
export type SwarmEvent = {
    type: "swarm_start";
    id: string;
    plan: SwarmPlan;
} | {
    type: "swarm_progress";
    id: string;
    branches: SwarmBranch[];
} | {
    type: "swarm_activity";
    id: string;
    taskId: string;
    event: AgentLifecycleEvent;
} | {
    type: "swarm_end";
    id: string;
    success: boolean;
};
export declare function autonomousSwarmPrompt(): string;
/** Runs inside the parent's already-authorized tool boundary, never a global executor. */
export declare function executeAutonomousSwarm(id: string, args: Record<string, unknown>, messages: Message[], config: CLIConfig, cwd: string, options: AgentRunOptions, spent: number, emit: (event: SwarmEvent) => void): Promise<{
    result: ToolResult;
    usage: UsageData;
    costUsd: number;
}>;
//# sourceMappingURL=swarm-tool.d.ts.map