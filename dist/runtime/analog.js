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
import { runAgent } from "../agent-runner.js";
import { extractToolCalls } from "../tool-parser.js";
import { executeToolCalls as realExecuteToolCalls } from "../tools.js";
import { TOOL_DEFINITIONS } from "../tool-definitions.js";
/** Tools allowed in analog mode. Everything else is refused. */
export const READ_ONLY_TOOLS = new Set([
    "read", "grep", "glob", "ls", "git", "web", "fetch", "vault", "skill", "bg_status", "bg_list",
]);
export function isReadOnlyTool(name) {
    return READ_ONLY_TOOLS.has(name);
}
/** Keep only the read-only tool definitions (e.g. to advertise to the model). */
export function filterReadOnlyToolDefinitions(defs = TOOL_DEFINITIONS) {
    return defs.filter((d) => isReadOnlyTool(d.function.name));
}
/** Serialize an audit event as one NDJSON line. */
export function formatAuditLine(event) {
    return JSON.stringify(event);
}
/**
 * Wrap a base tool executor so mutating/destructive tool calls are stripped from
 * the model response BEFORE execution (and reported as failed results), while
 * read-only calls run normally. Every decision is audited.
 */
export function createAnalogToolExec(baseExec = realExecuteToolCalls, options = {}) {
    const clock = options.clock ?? Date.now;
    const audit = (kind, tool, detail) => options.onAudit?.({ ts: clock(), kind, tool, detail });
    return async (response, cwd) => {
        const calls = extractToolCalls(response);
        const blocked = calls.filter((c) => !isReadOnlyTool(c.name));
        const allowed = calls.filter((c) => isReadOnlyTool(c.name));
        // Remove blocked tool tags so the base executor never runs them.
        let safeResponse = response;
        for (const b of blocked)
            safeResponse = safeResponse.split(b.raw).join("");
        for (const a of allowed)
            audit("tool_allowed", a.name);
        const execResult = await baseExec(safeResponse, cwd);
        const blockedResults = blocked.map((b) => {
            audit("tool_blocked", b.name, "read-only analog mode");
            return { tool: b.name, result: `blocked: ${b.name} is not allowed in read-only analog mode`, success: false };
        });
        return {
            results: [...execResult.results, ...blockedResults],
            cleanResponse: execResult.cleanResponse,
        };
    };
}
/**
 * Run the agent in read-only analog mode. Mutating tools are refused; every
 * action is captured in an NDJSON-serializable audit trail.
 */
export async function runAnalog(messages, config, cwd, options = {}) {
    const clock = options.clock ?? Date.now;
    const audit = [];
    const emit = (event) => {
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
//# sourceMappingURL=analog.js.map