import { type AgentRunOptions } from "./agent-runner.js";
import type { SubAgentResult } from "./sub-agents.js";
import type { CLIConfig, Message } from "./types.js";
/** Explicit /swarm, /parallel and /delegate rejoin the parent for a final answer.
 * Reports are reference data, never system instructions or fresh user authority. */
export declare function handoffAgentResults(task: string, results: SubAgentResult[], history: Message[], config: CLIConfig, cwd: string, options?: AgentRunOptions): Promise<import("./agent-runner.js").AgentRunResult>;
//# sourceMappingURL=agent-handoff.d.ts.map