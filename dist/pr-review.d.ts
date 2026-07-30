export interface PRData {
    number: number;
    title: string;
    body: string;
    headBranch: string;
    baseBranch: string;
    additions: number;
    deletions: number;
    files: PRFile[];
}
export interface PRFile {
    path: string;
    additions: number;
    deletions: number;
    status: "added" | "modified" | "deleted" | "renamed";
}
export interface PRAnalysis {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    filesByType: Record<string, number>;
    hasTests: boolean;
    hasConfigChanges: boolean;
    largeDiffs: string[];
    diffChunks: DiffChunk[];
}
export interface DiffChunk {
    file: string;
    content: string;
    additions: number;
    deletions: number;
}
export interface ReviewComment {
    path: string;
    line: number;
    body: string;
    severity: "critical" | "warning" | "suggestion" | "info";
}
export declare function fetchPRData(prUrl: string, cwd: string): {
    prData: PRData;
    diff: string;
};
export declare function analyzePRDiff(diff: string): PRAnalysis;
export declare function generateReviewPrompt(prData: PRData, analysis: PRAnalysis): string;
export declare function formatReviewResult(review: string): string;
export declare function parseReviewComments(review: string): ReviewComment[];
export declare function postReviewComments(prNumber: number, comments: ReviewComment[], cwd: string): {
    posted: number;
    errors: string[];
};
//# sourceMappingURL=pr-review.d.ts.map