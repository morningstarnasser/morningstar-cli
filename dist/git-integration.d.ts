export declare function isGitRepo(cwd: string): boolean;
export declare function gitDiff(cwd: string, staged?: boolean): string;
export declare function gitLog(cwd: string, count?: number): string;
export declare function gitBranch(cwd: string): {
    current: string;
    branches: string[];
};
export declare function gitStatusShort(cwd: string): string;
export declare function gitStatusFull(cwd: string): string;
export declare function gitAutoCommit(cwd: string, description: string): {
    success: boolean;
    message: string;
    hash?: string;
};
export declare function generateCommitMessage(diff: string): string;
export declare function gitCreateBranch(cwd: string, name: string): boolean;
export declare function gitStash(cwd: string, pop?: boolean): string;
//# sourceMappingURL=git-integration.d.ts.map