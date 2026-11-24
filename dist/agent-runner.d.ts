import { prepareKnowledge } from "./knowledge.js";
import { type SwarmEvent } from "./swarm-tool.js";
import type { Decision, PolicyVerdict } from "./policy-engine.js";
import type { Message, CLIConfig, ToolResult } from "./types.js";
import type { ParsedToolCall } from "./tools.js";
import type { StreamToken, UsageData } from "./providers.js";
/** Zero and omission mean unlimited; explicit finite limits remain available. */
export declare function resolveTurnLimit(value?: number): number;
export type StreamFn = (messages: Message[], config: CLIConfig, signal?: AbortSignal, enableTools?: boolean) => AsyncGenerator<StreamToken>;
/**
 * Legacy whole-response executor seam. It is retained for existing consumers
 * and tests; new integrations should inject the per-invocation executors.
 */
export type ToolExecFn = (response: string, cwd: string) => Promise<{
    results: ToolResult[];
    cleanResponse: string;
}>;
export type TextToolExecFn = (call: ParsedToolCall, cwd: string, signal?: AbortSignal) => ToolResult | Promise<ToolResult>;
export type NativeToolExecFn = (name: string, args: Record<string, unknown>, cwd: string, signal?: AbortSignal) => ToolResult | Promise<ToolResult>;
export interface ToolInvocation {
    /** Provider call id, or a deterministic runner-generated id for text calls. */
    id: string;
    /** Normalized lower-case tool name used for policy and execution. */
    name: string;
    /** Parsed arguments shared by text and native calls. */
    args: Record<string, unknown>;
    source: "text" | "native" | "legacy";
    /** Original text fragment or provider argument string, when available. */
    raw?: string;
    /** Invalid arguments are represented as an invocation and fail without execution. */
    parseError?: string;
}
export interface ToolApprovalRequest {
    turn: number;
    invocation: ToolInvocation;
    verdict: PolicyVerdict;
}
export type ToolApprovalResponse = boolean | {
    approved: boolean;
    reason?: string;
};
export interface ApprovalDecision {
    turn: number;
    invocation: ToolInvocation;
    decision: Extract<Decision, "allow" | "deny">;
    source: "policy" | "user" | "missing_callback";
    reason: string;
}
export type AgentLifecycleEvent = SwarmEvent | {
    type: "backend_activity";
    turn: number;
    activity: import("./providers/backend-events.js").BackendActivity;
} | {
    type: "turn_start";
    turn: number;
} | {
    type: "content_delta";
    turn: number;
    delta: string;
} | {
    type: "reasoning_delta";
    turn: number;
    delta: string;
} | {
    type: "tool_requested";
    turn: number;
    invocation: ToolInvocation;
} | {
    type: "approval_required";
    request: ToolApprovalRequest;
} | {
    type: "approval_decision";
    decision: ApprovalDecision;
} | {
    type: "tool_result";
    turn: number;
    invocation: ToolInvocation;
    result: ToolResult;
} | {
    type: "usage";
    turn: number;
    usage: UsageData;
} | {
    type: "turn_end";
    turn: number;
    text: string;
    tools: ToolResult[];
} | {
    type: "completion";
    result: AgentRunResult;
};
export interface AgentRunOptions {
    /** Root runs may delegate; workers cannot recursively start teams. */
    enableSwarm?: boolean;
    /** Optional model/tool turn cap. Omitted or 0 means unlimited. */
    maxTurns?: number;
    /** External abort signal (e.g. user pressed /stop). */
    signal?: AbortSignal;
    /** Cost already spent before this run (used for a session-wide budget). */
    initialCostUsd?: number;
    /** Disable provider tool advertisement for pure chat/read-only surfaces. */
    enableTools?: boolean;
    /**
     * Optional capability allowlist for a selected agent. This is enforced on
     * every normalized invocation (native, text, and compatibility calls) before
     * policy evaluation or any approval prompt.
     */
    toolAllowlist?: readonly string[];
    /** Called with each reasoning/thinking delta as it streams. */
    onReasoning?: (delta: string) => void;
    /** Called with each content delta as it streams. */
    onContent?: (delta: string) => void;
    /** Called once per turn after tools ran, with the turn's clean text + tools. */
    onTurnEnd?: (cleanText: string, tools: ToolResult[]) => void;
    /** Called for every individual tool result. */
    onTool?: (tool: ToolResult) => void;
    /** Receive every typed lifecycle event in emission order. */
    onEvent?: (event: AgentLifecycleEvent) => void;
    onTurnStart?: (turn: number) => void;
    onToolRequested?: (invocation: ToolInvocation, turn: number) => void;
    onApprovalRequired?: (request: ToolApprovalRequest) => void;
    onApprovalDecision?: (decision: ApprovalDecision) => void;
    onUsage?: (usage: UsageData, turn: number) => void;
    onComplete?: (result: AgentRunResult) => void;
    /**
     * Resolve an `ask` verdict. Missing callbacks deny fail-closed. Throwing
     * callbacks are also treated as denial.
     */
    onApproval?: (request: ToolApprovalRequest) => ToolApprovalResponse | Promise<ToolApprovalResponse>;
    /** Inject a fake model stream (tests). Defaults to the real provider. */
    streamFn?: StreamFn;
    /** Injectable local knowledge retrieval, still gated by tool policy. */
    knowledgeFn?: typeof prepareKnowledge;
    /** Legacy whole-response executor retained for compatibility. */
    toolExecFn?: ToolExecFn;
    /** Inject the normalized text-call executor. */
    textToolExecFn?: TextToolExecFn;
    /** Inject the provider-native executor. */
    nativeToolExecFn?: NativeToolExecFn;
}
export interface AgentRunResult {
    /** The model's final natural-language answer (tool tags stripped). */
    finalText: string;
    /** Actual provider transcript for resuming; includes tool calls and results. */
    messages?: Message[];
    structuredOutput?: unknown;
    structuredOutputError?: string;
    toolProtocolError?: string;
    /** Number of model turns executed. */
    turns: number;
    /** Every tool result produced across all turns, in order. */
    toolCalls: ToolResult[];
    /** Aggregate provider usage across turns. */
    usage: UsageData;
    /** Worker usage is separate so global tracking never bills it twice. */
    delegatedUsage?: UsageData;
    delegatedCostUsd?: number;
    /** Estimated billed cost incurred by this run. */
    costUsd: number;
    /** True when maxBudgetUsd stopped this run before another model/tool turn. */
    budgetExceeded: boolean;
    /** True if the run was cut short by the abort signal. */
    aborted: boolean;
    /** True if the run hit the maxTurns cap while still calling tools. */
    hitTurnLimit: boolean;
    /** True if an identical tool batch was requested in consecutive turns. */
    loopDetected: boolean;
}
/**
 * Run the agentic loop to completion. The input message array is never mutated.
 * All executors are reached only after a final allow decision.
 */
export declare function runAgent(messages: Message[], config: CLIConfig, cwd: string, options?: AgentRunOptions): Promise<AgentRunResult>;
//# sourceMappingURL=agent-runner.d.ts.map