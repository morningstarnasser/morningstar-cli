import { type AgentRunOptions, type AgentRunResult } from "./agent-runner.js";
import type { CLIConfig } from "./types.js";
/** Fixed argv only: repository diff drivers and textconv must never execute. */
export declare function reviewSnapshot(cwd: string): string;
/** Isolated review preserves the parent transcript and cannot grant write access. */
export declare function runCodeReview(scope: string, config: CLIConfig, cwd: string, options?: AgentRunOptions): Promise<AgentRunResult>;
//# sourceMappingURL=code-review.d.ts.map