export interface StreamingDiffState {
    /** The file being edited */
    filePath: string | null;
    /** Original file content (lines) */
    originalLines: string[];
    /** The old_string being searched for */
    oldString: string;
    /** The new_string being typed in */
    newString: string;
    /** Whether we're currently inside an edit tool call */
    active: boolean;
    /** Which part we're capturing: filePath, oldString, newString */
    phase: "idle" | "filePath" | "oldString" | "newString" | "complete";
    /** The computed diff lines so far */
    diffLines: DiffLine[];
    /** Start line number in the original file */
    startLine: number;
}
export interface DiffLine {
    type: "context" | "removed" | "added" | "header";
    lineNumber?: number;
    content: string;
}
/**
 * Create a new streaming diff state.
 */
export declare function createStreamingDiffState(): StreamingDiffState;
/**
 * Detect if the streaming text contains an edit/write tool call starting.
 * Returns the extracted fields so far from a partial tool call.
 */
export declare function parsePartialEditCall(text: string): {
    detected: boolean;
    filePath?: string;
    oldString?: string;
    newString?: string;
    isComplete: boolean;
};
/**
 * Update the streaming diff state with new streamed text.
 * Returns updated state with computed diff lines.
 */
export declare function updateStreamingDiff(state: StreamingDiffState, streamedText: string, cwd: string): StreamingDiffState;
/**
 * Compute diff lines from old and new strings.
 */
export declare function computeStreamingDiff(oldStr: string, newStr: string, startLine: number, filePath: string): DiffLine[];
/**
 * Format streaming diff lines for terminal display.
 */
export declare function formatStreamingDiff(state: StreamingDiffState): string;
/**
 * Check if the streamed text appears to contain an edit operation.
 */
export declare function hasEditOperation(text: string): boolean;
//# sourceMappingURL=streaming-diff.d.ts.map