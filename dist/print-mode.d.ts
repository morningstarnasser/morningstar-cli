import type { Readable } from "node:stream";
import type { AgentRunOptions } from "./agent-runner.js";
import { type AgentLifecycleEvent, type AgentRunResult, type ToolInvocation } from "./agent-runner.js";
import type { Message, CLIConfig } from "./types.js";
import type { PolicyVerdict } from "./policy-engine.js";
import type { UsageData } from "./providers.js";
export type PrintStreamEvent = Extract<AgentLifecycleEvent, {
    type: "backend_activity";
}> | import("./swarm-tool.js").SwarmEvent | {
    type: "turn_start";
    turn: number;
} | {
    type: "content";
    turn: number;
    text: string;
} | {
    type: "reasoning";
    turn: number;
    text: string;
} | {
    type: "tool_requested";
    turn: number;
    invocation: ToolInvocation;
} | {
    type: "approval_required";
    turn: number;
    invocation: ToolInvocation;
    verdict: PolicyVerdict;
} | {
    type: "approval_decision";
    turn: number;
    invocation: ToolInvocation;
    decision: "allow" | "deny";
    source: "policy" | "user" | "missing_callback";
    reason: string;
} | {
    type: "tool";
    turn: number;
    invocation: ToolInvocation;
    tool: string;
    result: string;
    success: boolean;
} | {
    type: "usage";
    turn: number;
    usage: UsageData;
} | {
    type: "turn_end";
    turn: number;
    text: string;
    toolCount: number;
} | {
    type: "completion";
    result: string;
    turns: number;
    toolCount: number;
    usage: UsageData;
    aborted: boolean;
    hitTurnLimit: boolean;
    loopDetected: boolean;
    structured_output?: unknown;
    structured_output_error?: string;
    tool_protocol_error?: string;
};
/** Convert internal lifecycle events to the stable NDJSON print contract. */
export declare function toPrintStreamEvent(event: AgentLifecycleEvent): PrintStreamEvent;
export declare function printExitCode(result: AgentRunResult): number;
export interface PrintIO {
    input?: Readable;
    write?: (text: string) => void;
    runnerOptions?: AgentRunOptions;
}
export declare function runPrintMode(prompt: string, systemPrompt: string, config: CLIConfig, cwd: string, resumedMessages?: Message[], io?: PrintIO): Promise<number>;
//# sourceMappingURL=print-mode.d.ts.map