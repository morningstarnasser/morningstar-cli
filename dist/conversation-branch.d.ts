import type { Message } from "./types.js";
export interface ConversationBranch {
    id: string;
    name: string;
    parentId: string | null;
    parentBranch: string | null;
    forkPoint: number;
    messages: Message[];
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, string>;
}
export interface BranchTree {
    branch: ConversationBranch;
    children: BranchTree[];
}
/**
 * Create a new conversation branch.
 * Forks from the current messages at the given index (or end).
 */
export declare function createBranch(sessionId: string, name: string, messages: Message[], forkPoint?: number, parentBranch?: string, metadata?: Record<string, string>): ConversationBranch;
/**
 * Save/update a branch with new messages.
 */
export declare function saveBranch(sessionId: string, branch: ConversationBranch): void;
/**
 * Load a branch by ID.
 */
export declare function loadBranch(sessionId: string, branchId: string): ConversationBranch | null;
/**
 * List all branches for a session.
 */
export declare function listBranches(sessionId: string): ConversationBranch[];
/**
 * Delete a branch.
 */
export declare function deleteBranch(sessionId: string, branchId: string): boolean;
/**
 * Switch to a branch — returns the messages to restore.
 */
export declare function switchBranch(sessionId: string, branchId: string): Message[] | null;
/**
 * Merge insights from a branch back to the main conversation.
 * Returns additional messages to append (assistant summaries from the branch).
 */
export declare function mergeBranch(sessionId: string, branchId: string, currentMessages: Message[]): {
    merged: Message[];
    summary: string;
} | null;
/**
 * Build a tree structure of branches.
 */
export declare function buildBranchTree(sessionId: string): BranchTree[];
/**
 * Format branches for display.
 */
export declare function formatBranchesList(branches: ConversationBranch[], currentBranchId?: string): string;
/**
 * Format branch tree as ASCII tree.
 */
export declare function formatBranchTree(trees: BranchTree[], prefix?: string, isLast?: boolean): string;
//# sourceMappingURL=conversation-branch.d.ts.map