export interface BuiltinHookConfig {
    /** Run linter/typecheck reminder after file edits */
    qualityGate?: boolean;
    /** Block modifications to linter/formatter configs */
    configProtection?: boolean;
    /** Warn when console.log is added */
    consoleLogWarning?: boolean;
    /** Suggest context compaction at intervals */
    suggestCompact?: boolean;
    /** Track and warn about cost per session */
    costTracker?: boolean;
}
export interface BuiltinHookResult {
    hookId: string;
    allowed: boolean;
    message?: string;
    severity?: "info" | "warning" | "error";
}
export interface PreHookEvent {
    tool: string;
    args?: string;
    filePath?: string;
    content?: string;
}
export interface PostHookEvent {
    tool: string;
    args?: string;
    filePath?: string;
    result?: string;
    success?: boolean;
    cwd?: string;
}
/**
 * Run all enabled built-in pre-execution hooks.
 * These run synchronously before a tool executes.
 * Returns an array of results; check `allowed` to gate execution.
 */
export declare function runBuiltinPreHooks(event: PreHookEvent, config: BuiltinHookConfig): ReadonlyArray<BuiltinHookResult>;
/**
 * Run all enabled built-in post-execution hooks.
 * These run synchronously after a tool executes.
 * Useful for reminders and tracking - they never block.
 */
export declare function runBuiltinPostHooks(event: PostHookEvent, config: BuiltinHookConfig): ReadonlyArray<BuiltinHookResult>;
/**
 * Returns sensible defaults for built-in hook configuration.
 * Safe guards enabled, performance-impacting features disabled.
 */
export declare function getBuiltinHookDefaults(): BuiltinHookConfig;
/**
 * Format built-in hooks status for the /hooks command display.
 */
export declare function formatBuiltinHooksStatus(config: BuiltinHookConfig): string;
/**
 * Reset session counters. Intended for testing only.
 */
export declare function resetBuiltinHookCounters(): void;
/**
 * Get current session counter values. Intended for testing/debugging.
 */
export declare function getBuiltinHookCounters(): {
    toolCalls: number;
    interactions: number;
};
//# sourceMappingURL=builtin-hooks.d.ts.map