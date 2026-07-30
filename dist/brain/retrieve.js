// ─── Brain Retrieval (pure, dependency-free BM25-lite) ───────────────────────
// Scores stored memories against a query using term-frequency × inverse-document-
// frequency with a light recency boost, so the gateway can inject the most
// relevant long-term context into each request. Pure + fully testable.
const STOPWORDS = new Set([
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "to", "of", "in", "on",
    "for", "with", "that", "this", "it", "as", "at", "by", "be", "der", "die", "das", "und",
    "oder", "ist", "ein", "eine", "im", "zu", "den", "dem", "mit", "auf", "von", "für", "ich",
    "du", "er", "sie", "es", "wir", "war", "wie", "was", "mir", "mich", "dir",
]);
export function tokenize(text) {
    return text
        .toLowerCase()
        .split(/[^a-z0-9äöüß_./-]+/i)
        .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}
const DAY_MS = 86_400_000;
// Memory layers (#3): durable knowledge (facts, distilled decisions) outranks
// ephemeral session outcomes so stale task-logs never dominate recall.
const KIND_WEIGHT = {
    fact: 1.3,
    decision: 1.25,
    note: 1.0,
    outcome: 0.85,
};
/** Inverse document frequency for each term across the corpus. */
function computeIdf(docs) {
    const df = new Map();
    for (const doc of docs) {
        for (const term of new Set(doc))
            df.set(term, (df.get(term) ?? 0) + 1);
    }
    const n = docs.length || 1;
    const idf = new Map();
    for (const [term, freq] of df)
        idf.set(term, Math.log(1 + n / freq));
    return idf;
}
/**
 * Return the top-`k` memories most relevant to `query`. Recency gives a small
 * tie-breaking boost (newer = slightly higher). Deterministic for a fixed `now`.
 */
export function retrieve(query, memories, k = 4, now = 0) {
    if (memories.length === 0)
        return [];
    const docTokens = memories.map((m) => tokenize(`${m.text} ${m.tags.join(" ")}`));
    const idf = computeIdf(docTokens);
    const qTerms = tokenize(query);
    if (qTerms.length === 0)
        return [];
    const scored = memories.map((memory, i) => {
        const tokens = docTokens[i];
        const tf = new Map();
        for (const t of tokens)
            tf.set(t, (tf.get(t) ?? 0) + 1);
        let score = 0;
        for (const q of qTerms) {
            const f = tf.get(q);
            if (f)
                score += (idf.get(q) ?? 0) * (f / (f + 1));
        }
        score *= KIND_WEIGHT[memory.kind] ?? 1.0;
        if (now > 0 && score > 0) {
            const ageDays = Math.max(0, (now - memory.createdAt) / DAY_MS);
            score += 0.15 * Math.exp(-ageDays / 30);
        }
        return { memory, score };
    });
    return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
}
/** Format retrieved memories as a compact system-prompt block. */
export function formatRecall(scored) {
    if (scored.length === 0)
        return "";
    const lines = scored.map((s) => `- (${s.memory.kind}) ${s.memory.text}`);
    return `Relevante Erinnerungen aus früheren Sessions:\n${lines.join("\n")}`;
}
//# sourceMappingURL=retrieve.js.map