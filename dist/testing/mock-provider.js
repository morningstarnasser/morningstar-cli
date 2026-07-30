// ─── Deterministic Mock Provider ─────────────────────────────────────────────
// TypeScript analogue of claw-code's `mock-anthropic-service`: a scriptable,
// network-free model provider plus a scripted tool executor. Together they let
// the real agent loop (`runAgent`) and the Telegram gateway run fully
// deterministically — no network, no filesystem, no clock, no randomness — so a
// parity harness can lock behavior the way claw-code's captured /v1/messages
// requests do.
//
// This module is intentionally additive: it adds nothing to the live code paths
// and is imported only by tests (and, later, an optional `parity` command).
const CHUNK_SIZE = 24;
function* chunkContent(text) {
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        yield { type: "content", text: text.slice(i, i + CHUNK_SIZE) };
    }
}
/**
 * Build a deterministic provider from a script of turns. Each call to the
 * returned `streamFn` consumes the next turn. Calls beyond the script emit
 * nothing (which makes the agent loop end), so over-running is safe.
 */
export function createMockProvider(turns) {
    const requests = [];
    let calls = 0;
    const streamFn = async function* (messages, config, signal, enableTools = true) {
        requests.push({ messages: [...messages], config, enableTools });
        const turn = turns[calls] ?? {};
        calls++;
        if (turn.tokens) {
            for (const token of turn.tokens) {
                if (signal?.aborted)
                    return;
                yield token;
            }
            return;
        }
        if (turn.reasoning && !signal?.aborted) {
            yield { type: "reasoning", text: turn.reasoning };
        }
        if (turn.content) {
            for (const token of chunkContent(turn.content)) {
                if (signal?.aborted)
                    return;
                yield token;
            }
        }
    };
    return { requests, streamFn, callCount: () => calls };
}
/**
 * Build a deterministic tool executor from a script. Each agent turn consumes
 * the next step; steps beyond the script return no results (ending the loop).
 */
export function scriptedToolExec(steps) {
    let i = 0;
    return async (response) => {
        const step = steps[i];
        i++;
        if (!step)
            return { results: [], cleanResponse: response };
        return { results: step.results, cleanResponse: step.cleanResponse ?? response };
    };
}
/** Convenience: a successful tool result with sensible defaults. */
export function toolOk(tool, result) {
    return { tool, result, success: true };
}
/** Convenience: a failed tool result (e.g. permission denied). */
export function toolFail(tool, result) {
    return { tool, result, success: false };
}
//# sourceMappingURL=mock-provider.js.map