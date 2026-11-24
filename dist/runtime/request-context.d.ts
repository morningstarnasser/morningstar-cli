import type { Message } from "../types.js";
export interface RequestContext {
    messages: Message[];
    removedMessages: number;
}
/**
 * Bound each provider request, not the stored transcript. Native call/result
 * batches are indivisible. Keep system rules and the first/latest user task.
 * Extractive history is explicitly labelled; original evidence stays in history.
 */
export declare function compactRequest(messages: Message[], maxChars?: number): RequestContext;
//# sourceMappingURL=request-context.d.ts.map