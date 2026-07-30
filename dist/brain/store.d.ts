import type { BrainMemory } from "./retrieve.js";
import { type ScoredMemory } from "./retrieve.js";
export declare class Brain {
    private clock;
    private memories;
    constructor(clock?: () => number);
    private read;
    private persist;
    private genId;
    /** Store a new memory. Trims the corpus if it grows past MAX_MEMORIES. */
    remember(text: string, kind?: BrainMemory["kind"], tags?: string[]): BrainMemory;
    /** Keep decisions/facts; drop the oldest notes/outcomes when over capacity. */
    private trim;
    recall(query: string, k?: number): ScoredMemory[];
    recallText(query: string, k?: number): string;
    /** Memories of a kind created within the last `sinceMs` (default: all). */
    recent(kind: BrainMemory["kind"], sinceMs?: number, now?: number): BrainMemory[];
    count(): number;
}
export declare const BRAIN_STORE_PATH: string;
//# sourceMappingURL=store.d.ts.map