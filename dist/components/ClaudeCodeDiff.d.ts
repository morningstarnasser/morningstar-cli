interface ClaudeCodeDiffProps {
    oldStr: string;
    newStr: string;
    filePath?: string;
    startLineNumber?: number;
    maxLines?: number;
}
/** Shared bounded diff for legacy tool panels and inline edits. */
export declare function ClaudeCodeDiff({ oldStr, newStr, filePath, startLineNumber, maxLines }: ClaudeCodeDiffProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ClaudeCodeDiff.d.ts.map