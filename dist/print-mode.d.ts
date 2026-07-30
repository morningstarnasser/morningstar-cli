import { type AgentLifecycleEvent, type ToolInvocation } from "./agent-runner.js";
import type { CLIConfig } from "./types.js";
import type { PolicyVerdict } from "./policy-engine.js";
import type { UsageData } from "./providers.js";
export type PrintStreamEvent = {
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
};
/** Convert internal lifecycle events to the stable NDJSON print contract. */
export declare function toPrintStreamEvent(event: AgentLifecycleEvent): PrintStreamEvent;
export declare function runPrintMode(prompt: string, systemPrompt: string, config: CLIConfig, cwd: string): Promise<void>;
//# sourceMappingURL=print-mode.d.ts.map