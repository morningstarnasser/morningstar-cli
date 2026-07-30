export interface BrainMemory {
    id: string;
    text: string;
    kind: "note" | "outcome" | "decision" | "fact";
    tags: string[];
    createdAt: number;
}
export declare function tokenize(text: string): string[];
export interface ScoredMemory {
    memory: BrainMemory;
    score: number;
}
/**
 * Return the top-`k` memories most relevant to `query`. Recency gives a small
 * tie-breaking boost (newer = slightly higher). Deterministic for a fixed `now`.
 */
export declare function retrieve(query: string, memories: BrainMemory[], k?: number, now?: number): ScoredMemory[];
/** Format retrieved memories as a compact system-prompt block. */
export declare function formatRecall(scored: ScoredMemory[]): string;
//# sourceMappingURL=retrieve.d.ts.map