// ─── Session Compaction ──────────────────────────────────────────────────────
// claw-code-style auto-compaction for long conversations. Where Carry's existing
// `trimHistory` hard-drops old messages (losing context), this condenses the
// oldest messages into a single summary message and keeps the most recent turns
// verbatim — so a long-running Telegram chat stays within budget without
// forgetting what happened.
//
// Pure + dependency-injected: the summarizer is a callback, so this is fully
// deterministic in tests and can use an LLM in production. Additive module — the
// live gateway opts in; existing flows are unchanged.
const CHARS_PER_TOKEN = 4;
const DEFAULTS = {
    maxMessages: 40,
    maxTokens: 6000,
    keepRecent: 12,
    summaryPrefix: "[Summary of earlier conversation]",
};
/** Rough token estimate (~4 chars/token) over message contents. */
export function estimateTokens(messages) {
    const chars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(chars / CHARS_PER_TOKEN);
}
/** Whether the history is over budget and should be compacted. */
export function needsCompaction(messages, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    return messages.length > opts.maxMessages || estimateTokens(messages) > opts.maxTokens;
}
/** Deterministic fallback summary: an extractive condensation, no LLM. */
export function defaultSummary(messages) {
    const firstLine = (s) => (s.split("\n").find((l) => l.trim()) ?? "").slice(0, 140);
    const lines = messages
        .filter((m) => m.role !== "system")
        .map((m) => `- ${m.role}: ${firstLine(m.content)}`);
    const head = `${messages.length} earlier messages condensed.`;
    return [head, ...lines.slice(0, 12)].join("\n");
}
/**
 * Compact `messages` if over budget: fold everything except the most recent
 * `keepRecent` into one summary message, prepended to the kept tail. Returns a
 * new array; the input is never mutated. If a `summarize` callback is given it
 * produces the summary text (e.g. via an LLM); otherwise `defaultSummary` is used.
 */
export async function compactMessages(messages, options = {}, summarize) {
    const opts = { ...DEFAULTS, ...options };
    const beforeTokens = estimateTokens(messages);
    const keep = Math.min(opts.keepRecent, messages.length);
    const toCompact = messages.slice(0, messages.length - keep);
    if (!needsCompaction(messages, options) || toCompact.length === 0) {
        return { messages: [...messages], compacted: false, removedCount: 0, beforeTokens, afterTokens: beforeTokens };
    }
    const recent = messages.slice(messages.length - keep);
    const summaryText = await (summarize ? summarize(toCompact) : defaultSummary(toCompact));
    const summaryMessage = { role: "user", content: `${opts.summaryPrefix}\n${summaryText}` };
    const next = [summaryMessage, ...recent];
    return {
        messages: next,
        compacted: true,
        removedCount: toCompact.length,
        summary: summaryText,
        beforeTokens,
        afterTokens: estimateTokens(next),
    };
}
//# sourceMappingURL=compaction.js.map