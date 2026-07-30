export type ProjectEnvSource = "settings.env" | ".env.local" | ".env";
export interface ProjectEnvRejection {
    key: string;
    source: ProjectEnvSource;
    reason: string;
}
export interface ProjectEnvReport {
    applied: string[];
    skippedExisting: string[];
    rejected: ProjectEnvRejection[];
    readErrors: Array<{
        source: ProjectEnvSource;
        reason: string;
    }>;
}
export interface ProjectEnvValidation {
    allowed: boolean;
    reason?: string;
}
/**
 * Pure classification helper. Matching is case-insensitive so the same policy
 * remains safe on case-insensitive environment implementations.
 */
export declare function validateProjectEnvEntry(key: string, value: unknown): ProjectEnvValidation;
/** Parse the intentionally small KEY=value subset historically supported. */
export declare function parseProjectEnv(content: string): Record<string, string>;
/**
 * Apply trusted-by-policy project values without replacing inherited process
 * values. Invalid or dangerous entries fail closed and are reported by key only.
 */
export declare function applyProjectEnv(values: Record<string, unknown> | undefined, target?: NodeJS.ProcessEnv, source?: ProjectEnvSource): ProjectEnvReport;
/**
 * Load project `.env.local` then `.env`, preserving the historical precedence
 * (`.env.local` wins) while applying the process-execution policy to both.
 */
export declare function loadProjectEnvFiles(dir: string, target?: NodeJS.ProcessEnv): ProjectEnvReport;
//# sourceMappingURL=env.d.ts.map