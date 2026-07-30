import type { Message } from "../types.js";
export interface CompactionOptions {
    /** Trigger when message count exceeds this. Default 40. */
    maxMessages?: number;
    /** Trigger when estimated token count exceeds this. Default 6000. */
    maxTokens?: number;
    /** Most-recent messages always kept verbatim. Default 12. */
    keepRecent?: number;
    /** Prefix marker for the injected summary message. */
    summaryPrefix?: string;
}
export interface CompactionResult {
    /** The (possibly) compacted message list. Never mutates the input. */
    messages: Message[];
    /** Whether compaction actually ran. */
    compacted: boolean;
    /** How many original messages were folded into the summary. */
    removedCount: number;
    /** The summary text used (if compacted). */
    summary?: string;
    beforeTokens: number;
    afterTokens: number;
}
/** A summarizer turns a slice of old messages into a short text. */
export type Summarizer = (messages: Message[]) => string | Promise<string>;
/** Rough token estimate (~4 chars/token) over message contents. */
export declare function estimateTokens(messages: Message[]): number;
/** Whether the history is over budget and should be compacted. */
export declare function needsCompaction(messages: Message[], options?: CompactionOptions): boolean;
/** Deterministic fallback summary: an extractive condensation, no LLM. */
export declare function defaultSummary(messages: Message[]): string;
/**
 * Compact `messages` if over budget: fold everything except the most recent
 * `keepRecent` into one summary message, prepended to the kept tail. Returns a
 * new array; the input is never mutated. If a `summarize` callback is given it
 * produces the summary text (e.g. via an LLM); otherwise `defaultSummary` is used.
 */
export declare function compactMessages(messages: Message[], options?: CompactionOptions, summarize?: Summarizer): Promise<CompactionResult>;
//# sourceMappingURL=compaction.d.ts.map