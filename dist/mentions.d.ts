export interface MentionResult {
    type: "file" | "files" | "folder" | "git" | "url" | "codebase" | "diff" | "tree";
    source: string;
    content: string;
    tokenEstimate: number;
    priority: number;
}
export interface ContextBudget {
    maxTokens: number;
    usedTokens: number;
    remainingTokens: number;
    mentionCount: number;
    warnings: string[];
    wasTruncated: boolean;
}
export declare function parseMentions(input: string, cwd: string): {
    cleanInput: string;
    mentions: MentionResult[];
};
export declare function getContextBudget(mentions: MentionResult[], maxTokens?: number): ContextBudget;
export declare function formatMentionContext(mentions: MentionResult[]): string;
export declare function getMentionCompletions(partial: string, cwd: string): string[];
//# sourceMappingURL=mentions.d.ts.map