export interface WorktreeSession {
    path: string;
    branch: string;
    repository: string;
}
/** Create from HEAD without disturbing a dirty working tree. Preserve on exit for review. */
export declare function createWorktreeSession(cwd: string, name?: string, storageRoot?: string): WorktreeSession;
//# sourceMappingURL=worktree-session.d.ts.map