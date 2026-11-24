import { type AgentRunOptions, type AgentRunResult } from "./agent-runner.js";
import type { CLIConfig, Message } from "./types.js";
/** An isolated answer: no tool execution, no changed session transcript or persistence. */
export declare function runSideQuestion(messages: readonly Message[], question: string, config: CLIConfig, cwd: string, options?: AgentRunOptions): Promise<AgentRunResult>;
//# sourceMappingURL=side-question.d.ts.map