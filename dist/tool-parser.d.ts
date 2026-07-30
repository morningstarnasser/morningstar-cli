export interface ParsedToolCall {
    name: string;
    args: string;
    /** The full matched substring, used by the executor to strip it from output. */
    raw: string;
    /** Offset of the match in the original text. */
    index: number;
}
export interface ExtractOptions {
    maxPayload?: number;
}
/**
 * Extract executable tool calls from model output, applying the safety rules.
 * Returns calls in document order.
 */
export declare function extractToolCalls(text: string, opts?: ExtractOptions): ParsedToolCall[];
//# sourceMappingURL=tool-parser.d.ts.map