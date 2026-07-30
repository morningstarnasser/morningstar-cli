import type { Message } from "../types.js";
import { type CompactionOptions, type CompactionResult, type Summarizer } from "../runtime/compaction.js";
export interface ChatSession {
    chatId: number;
    cwd: string;
    model?: string;
    /** Conversation history WITHOUT the system prompt (added fresh per request). */
    messages: Message[];
    updatedAt: number;
}
/**
 * Trim conversation history to the most recent `limit` messages while keeping
 * pairs sensible. Pure + exported for testing. Never mutates the input.
 */
export declare function trimHistory(messages: Message[], limit: number): Message[];
export declare class SessionStore {
    private defaultCwd;
    private historyLimit;
    private clock;
    private storeFile;
    private sessions;
    constructor(defaultCwd: string, historyLimit?: number, clock?: () => number, storeFile?: string | null);
    private read;
    private persist;
    get(chatId: number): ChatSession;
    /** Append a message and persist, trimming history to the configured limit. */
    append(chatId: number, message: Message): ChatSession;
    /** Patch session fields (cwd, model) and persist. */
    update(chatId: number, patch: Partial<Omit<ChatSession, "chatId">>): ChatSession;
    /** Clear conversation history (keeps cwd + model). */
    reset(chatId: number): ChatSession;
    /**
     * Compact a chat's history if it is over budget, folding old messages into a
     * summary while keeping recent turns verbatim. Additive + opt-in: callers
     * invoke this explicitly; `append`/`trimHistory` behavior is unchanged. When
     * nothing is compacted the session is returned untouched.
     */
    compact(chatId: number, options?: CompactionOptions, summarize?: Summarizer): Promise<{
        session: ChatSession;
        result: CompactionResult;
    }>;
}
export declare const TELEGRAM_SESSIONS_PATH: string;
//# sourceMappingURL=sessions.d.ts.map