import type { Message } from "./types.js";
export interface Checkpoint {
    id: string;
    name: string;
    gitRef?: string;
    messages: Message[];
    timestamp: string;
    cwd: string;
    description?: string;
}
/**
 * Create a checkpoint: snapshot git state + conversation.
 */
export declare function createCheckpoint(name: string, messages: Message[], cwd: string, description?: string): Checkpoint;
/**
 * List all checkpoints.
 */
export declare function listCheckpoints(): Checkpoint[];
/**
 * Load a checkpoint by ID.
 */
export declare function loadCheckpoint(id: string): Checkpoint | null;
/**
 * Restore a checkpoint: restore git state + return conversation.
 */
export declare function restoreCheckpoint(id: string, cwd: string): {
    success: boolean;
    messages?: Message[];
    error?: string;
};
/**
 * Delete a checkpoint.
 */
export declare function deleteCheckpoint(id: string): boolean;
/**
 * Format checkpoints list for display.
 */
export declare function formatCheckpointsList(checkpoints: Checkpoint[]): string;
//# sourceMappingURL=checkpoints.d.ts.map