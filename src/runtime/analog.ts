// ─── Analog Mode (read-only, auditable agent) ────────────────────────────────
// Carry's counterpart to claw-code's `claw-analog`: a constrained run mode that
// only ever performs read-only tools, refuses mutating/destructive ones, and
// emits an NDJSON audit trail of every action — for CI, audits, and untrusted
// directives. It composes the real agent loop and the real tool executor; the
// guard strips mutating tool calls BEFORE execution, so nothing can slip through.
//
// Additive + dependency-injected: the base executor and clock are injectable, so
// this is fully testable with no filesystem, network, or clock dependency. The
// live gateway is untouched.

import { runAgent, type AgentRunResult, type AgentRunOptions, type ToolExecFn } from "../agent-runner.js";
import { extractToolCalls } from "../tool-parser.js";
import { executeToolCalls as realExecuteToolCalls } from "../tools.js";
import type { Message, CLIConfig, ToolResult } from "../types.js";
import type { OpenAIToolDefinition } from "../tool-definitions.js";
import { TOOL_DEFINITIONS } from "../tool-definitions.js";

/** Tools allowed in analog mode. Everything else is refused. */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "read", "grep", "glob", "ls", "git", "web", "fetch", "vault", "skill", "bg_status", "bg_list",
]);

export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name);
}

/** Keep only the read-only tool definitions (e.g. to advertise to the model). */
export function filterReadOnlyToolDefinitions(
  defs: OpenAIToolDefinition[] = TOOL_DEFINITIONS,
): OpenAIToolDefinition[] {
  return defs.filter((d) => isReadOnlyTool(d.function.name));
}

export type AnalogAuditKind = "start" | "tool_allowed" | "tool_blocked" | "end";

export interface AnalogAuditEvent {
  ts: number;
  kind: AnalogAuditKind;
  tool?: string;
  detail?: string;
}

/** Serialize an audit event as one NDJSON line. */
export function formatAuditLine(event: AnalogAuditEvent): string {
  return JSON.stringify(event);
}

export interface AnalogToolExecOptions {
  onAudit?: (event: AnalogAuditEvent) => void;
  clock?: () => number;
}

/**
 * Wrap a base tool executor so mutating/destructive tool calls are stripped from
 * the model response BEFORE execution (and reported as failed results), while
 * read-only calls run normally. Every decision is audited.
 */
export function createAnalogToolExec(
  baseExec: ToolExecFn = realExecuteToolCalls,
  options: AnalogToolExecOptions = {},
): ToolExecFn {
  const clock = options.clock ?? Date.now;
  const audit = (kind: AnalogAuditKind, tool?: string, detail?: string) =>
    options.onAudit?.({ ts: clock(), kind, tool, detail });

  return async (response: string, cwd: string) => {
    const calls = extractToolCalls(response);
    const blocked = calls.filter((c) => !isReadOnlyTool(c.name));
    const allowed = calls.filter((c) => isReadOnlyTool(c.name));

    // Remove blocked tool tags so the base executor never runs them.
    let safeResponse = response;
    for (const b of blocked) safeResponse = safeResponse.split(b.raw).join("");

    for (const a of allowed) audit("tool_allowed", a.name);
    const execResult = await baseExec(safeResponse, cwd);

    const blockedResults: ToolResult[] = blocked.map((b) => {
      audit("tool_blocked", b.name, "read-only analog mode");
      return { tool: b.name, result: `blocked: ${b.name} is not allowed in read-only analog mode`, success: false };
    });

    return {
      results: [...execResult.results, ...blockedResults],
      cleanResponse: execResult.cleanResponse,
    };
  };
}

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
export async function runAnalog(
  messages: Message[],
  config: CLIConfig,
  cwd: string,
  options: AnalogRunOptions = {},
): Promise<AnalogRunResult> {
  const clock = options.clock ?? Date.now;
  const audit: AnalogAuditEvent[] = [];
  const emit = (event: AnalogAuditEvent) => {
    audit.push(event);
    options.onAudit?.(event);
  };

  emit({ ts: clock(), kind: "start" });
  const toolExecFn = createAnalogToolExec(options.baseExec, { onAudit: emit, clock });

  const { baseExec: _baseExec, onAudit: _onAudit, clock: _clock, ...runOpts } = options;
  const result = await runAgent(messages, config, cwd, { ...runOpts, toolExecFn });

  emit({ ts: clock(), kind: "end", detail: `${result.turns} turns, ${result.toolCalls.length} tools` });
  return { result, audit };
}
