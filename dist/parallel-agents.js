// ─── Parallel Sub-Agents ─────────────────────────────────────────────────────
// Run several independent agent tasks concurrently and aggregate their answers.
// Used by the Telegram /parallel command — fan out work from your phone, which
// neither Codex nor Hermes can do. Built on the shared agent-runner so each task
// gets the full multi-turn tool loop.
import { runAgent, } from "./agent-runner.js";
const MAX_TASKS = 5;
/**
 * Parse a free-text block into discrete tasks. One per line; if a single line,
 * split on ";". Leading bullets/numbers are stripped. Pure + testable.
 */
export function parseTasks(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return [];
    let parts = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    if (parts.length === 1)
        parts = parts[0].split(";").map((p) => p.trim()).filter(Boolean);
    return parts.map((raw) => {
        const prompt = raw.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim();
        const label = prompt.length > 32 ? `${prompt.slice(0, 32)}…` : prompt;
        return { label, prompt };
    });
}
/**
 * Run all tasks concurrently. Capped at MAX_TASKS — extra tasks are dropped (the
 * caller is told). Each task that throws yields an ok:false result instead of
 * failing the whole batch.
 */
export async function runParallel(tasks, config, cwd, options) {
    const capped = tasks.slice(0, MAX_TASKS);
    const dropped = tasks.length - capped.length;
    const results = await Promise.all(capped.map(async (task) => {
        try {
            const result = await runAgent(options.buildMessages(task.prompt), config, cwd, {
                maxTurns: options.maxTurns,
                signal: options.signal,
                streamFn: options.streamFn,
                onApproval: options.onApproval,
            });
            if (result.aborted) {
                return {
                    label: task.label,
                    text: result.finalText || "Abgebrochen.",
                    tools: result.toolCalls.length,
                    ok: false,
                };
            }
            return { label: task.label, text: result.finalText || "(kein Output)", tools: result.toolCalls.length, ok: true };
        }
        catch (e) {
            return { label: task.label, text: `Fehler: ${e.message}`, tools: 0, ok: false };
        }
    }));
    return { results, dropped };
}
/** Render aggregated results into one Telegram message. */
export function formatParallelResults(results, dropped) {
    const blocks = results.map((r, i) => `*${i + 1}. ${r.ok ? "" : "⚠️ "}${r.label}*\n${r.text}${r.tools ? `\n_(${r.tools} Tools)_` : ""}`);
    const note = dropped > 0 ? `\n\n_${dropped} Task(s) verworfen (max ${MAX_TASKS} parallel)._` : "";
    return `🧩 ${results.length} parallele Agenten:\n\n${blocks.join("\n\n")}${note}`;
}
//# sourceMappingURL=parallel-agents.js.map