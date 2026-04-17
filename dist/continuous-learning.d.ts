declare const VALID_DOMAINS: readonly ["code-style", "testing", "git", "debugging", "workflow", "general"];
type Domain = typeof VALID_DOMAINS[number];
export interface Observation {
    timestamp: string;
    event: string;
    tool?: string;
    input?: string;
    output?: string;
    success?: boolean;
    projectId?: string;
    duration?: number;
}
export interface Instinct {
    id: string;
    trigger: string;
    action: string;
    confidence: number;
    domain: Domain;
    scope: "project" | "global";
    projectId?: string;
    evidence: string[];
    createdAt: string;
    updatedAt: string;
}
/**
 * Generate a stable project identifier from git remote URL or working directory path.
 * The same project always produces the same ID.
 */
export declare function detectProjectId(cwd: string): string;
/**
 * Record a tool-use observation. Fire-and-forget: uses sync I/O in try/catch,
 * never throws, never blocks the caller.
 */
export declare function recordObservation(obs: Observation): void;
/**
 * Read recent observations, optionally filtered to a specific project.
 * Returns the most recent `limit` observations (default 100).
 */
export declare function getObservations(projectId?: string, limit?: number): Observation[];
/**
 * Load all instincts from personal, inherited, and optionally project-specific directories.
 * Deduplicates by instinct ID (personal takes precedence over inherited, project is additive).
 */
export declare function loadInstincts(projectId?: string): Instinct[];
/**
 * Persist an instinct as an individual JSON file.
 * Location depends on scope: global goes to personal/, project goes to projects/<id>/instincts/.
 */
export declare function saveInstinct(instinct: Instinct): void;
/**
 * Adjust an instinct's confidence by `delta` and persist the change.
 * Returns the updated instinct, or null if not found.
 */
export declare function updateConfidence(instinctId: string, delta: number): Instinct | null;
/**
 * Promote a project-scoped instinct to global scope.
 * Moves the file from projects/<id>/instincts/ to personal/.
 */
export declare function promoteInstinct(instinctId: string): void;
/**
 * Export all instincts (personal + inherited) as a JSON string for sharing.
 */
export declare function exportInstincts(): string;
/**
 * Import instincts from a JSON string. Returns counts and any errors encountered.
 * Imported instincts land in the inherited/ directory and do not overwrite personal instincts.
 */
export declare function importInstincts(json: string): {
    imported: number;
    errors: string[];
};
/**
 * Format active instincts as a text block suitable for injection into a system prompt.
 * High-confidence instincts appear first. Only instincts above 0.4 confidence are included.
 */
export declare function getInstinctsPromptAddition(projectId?: string): string;
/**
 * Format a human-readable status display for the /instinct-status command.
 */
export declare function formatInstinctsStatus(projectId?: string): string;
export {};
//# sourceMappingURL=continuous-learning.d.ts.map