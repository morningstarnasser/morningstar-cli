import { type AgentRunResult, type AgentRunOptions, type ToolExecFn } from "../agent-runner.js";
import type { Message, CLIConfig } from "../types.js";
import type { OpenAIToolDefinition } from "../tool-definitions.js";
/** Tools allowed in analog mode. Everything else is refused. */
export declare const READ_ONLY_TOOLS: ReadonlySet<string>;
export declare function isReadOnlyTool(name: string): boolean;
/** Keep only the read-only tool definitions (e.g. to advertise to the model). */
export declare function filterReadOnlyToolDefinitions(defs?: OpenAIToolDefinition[]): OpenAIToolDefinition[];
export type AnalogAuditKind = "start" | "tool_allowed" | "tool_blocked" | "end";
export interface AnalogAuditEvent {
    ts: number;
    kind: AnalogAuditKind;
    tool?: string;
    detail?: string;
}
/** Serialize an audit event as one NDJSON line. */
export declare function formatAuditLine(event: AnalogAuditEvent): string;
export interface AnalogToolExecOptions {
    onAudit?: (event: AnalogAuditEvent) => void;
    clock?: () => number;
}
/**
 * Wrap a base tool executor so mutating/destructive tool calls are stripped from
 * the model response BEFORE execution (and reported as failed results), while
 * read-only calls run normally. Every decision is audited.
 */
export declare function createAnalogToolExec(baseExec?: ToolExecFn, options?: AnalogToolExecOptions): ToolExecFn;
export interface AnalogRunOptions extends Omit<AgentRunOptions, "toolExecFn"> {
    /** Base executor (defaults to the real one). Override in tests. */
    baseExec?: ToolExecFn;
    /** Receive each audit event live (also returned in the result). */
    onAudit?: (event: AnalogAuditEvent) => void;
    /** Injectable clock for deterministic audit timestamps. */
    clock?: () => number;
}
export interface AnalogRunResult {
    result: AgentRunResult;
    /** Full NDJSON audit trail, in order. */
    audit: AnalogAuditEvent[];
}
/**
 * Run the agent in read-only analog mode. Mutating tools are refused; every
 * action is captured in an NDJSON-serializable audit trail.
 */
export declare function runAnalog(messages: Message[], config: CLIConfig, cwd: string, options?: AnalogRunOptions): Promise<AnalogRunResult>;
//# sourceMappingURL=analog.d.ts.map