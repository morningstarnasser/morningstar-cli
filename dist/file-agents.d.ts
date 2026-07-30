import type { Agent } from "./agents.js";
export interface FileAgent extends Agent {
    id: string;
    source: "global" | "project";
    filePath: string;
    tools?: string[];
    preferredModel?: string;
    temperature?: number;
    maxTokens?: number;
}
/**
 * Load all file-based agents (global + project).
 * Project agents override global ones with the same ID.
 */
export declare function loadFileAgents(cwd: string): Record<string, FileAgent>;
/**
 * Create a new agent as a .md file.
 */
export declare function createFileAgent(id: string, name: string, description: string, systemPrompt: string, options?: {
    color?: string;
    tools?: string[];
    preferredModel?: string;
    global?: boolean;
}, cwd?: string): {
    success: boolean;
    filePath?: string;
    error?: string;
};
/**
 * Migrate agents.json entries to .md files.
 */
export declare function migrateAgentsJsonToMd(cwd: string): {
    migrated: number;
    errors: string[];
};
/**
 * Format file agents list for display.
 */
export declare function formatFileAgentsList(agents: Record<string, FileAgent>): string;
//# sourceMappingURL=file-agents.d.ts.map