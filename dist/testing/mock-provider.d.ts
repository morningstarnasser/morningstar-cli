import type { Message, CLIConfig, ToolResult } from "../types.js";
import type { StreamToken } from "../providers.js";
import type { StreamFn, ToolExecFn } from "../agent-runner.js";
/** One captured model request, in order, for assertions and snapshots. */
export interface CapturedRequest {
    messages: Message[];
    config: CLIConfig;
    enableTools: boolean;
}
/** A single scripted model turn. */
export interface MockTurn {
    /** Emitted first as a reasoning token (optional). */
    reasoning?: string;
    /** Emitted as chunked content tokens (streaming-faithful). */
    content?: string;
    /** Fully explicit token sequence; overrides reasoning/content when set. */
    tokens?: StreamToken[];
}
export interface MockProvider {
    /** Captured requests, one per streamFn call, in order. */
    readonly requests: CapturedRequest[];
    /** Drop-in replacement for the real provider stream. */
    streamFn: StreamFn;
    /** Number of streamFn calls so far. */
    callCount(): number;
}
/**
 * Build a deterministic provider from a script of turns. Each call to the
 * returned `streamFn` consumes the next turn. Calls beyond the script emit
 * nothing (which makes the agent loop end), so over-running is safe.
 */
export declare function createMockProvider(turns: MockTurn[]): MockProvider;
/** One scripted tool-execution step (replaces real parsing + side effects). */
export interface ScriptedToolStep {
    /** Tool results this turn produces (empty array ends the loop). */
    results: ToolResult[];
    /** The tool-stripped assistant text. Defaults to the raw response. */
    cleanResponse?: string;
}
/**
 * Build a deterministic tool executor from a script. Each agent turn consumes
 * the next step; steps beyond the script return no results (ending the loop).
 */
export declare function scriptedToolExec(steps: ScriptedToolStep[]): ToolExecFn;
/** Convenience: a successful tool result with sensible defaults. */
export declare function toolOk(tool: string, result: string): ToolResult;
/** Convenience: a failed tool result (e.g. permission denied). */
export declare function toolFail(tool: string, result: string): ToolResult;
//# sourceMappingURL=mock-provider.d.ts.map