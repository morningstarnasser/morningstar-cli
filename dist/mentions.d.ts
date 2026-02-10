export interface MentionResult {
    type: "file" | "folder" | "git" | "url" | "codebase";
    source: string;
    content: string;
    tokenEstimate: number;
}
export declare function parseMentions(input: string, cwd: string): {
    cleanInput: string;
    mentions: MentionResult[];
};
export declare function formatMentionContext(mentions: MentionResult[]): string;
export declare function getMentionCompletions(partial: string, cwd: string): string[];
//# sourceMappingURL=mentions.d.ts.map