import type { MorningstarSettings } from "./settings.js";
export type HookEvent = "preToolExecution" | "postToolExecution" | "preFileWrite" | "postFileWrite" | "preFileEdit" | "postFileEdit" | "preBash" | "postBash" | "preCommit" | "postCommit" | "sessionStart" | "sessionEnd" | "preMessage" | "postMessage";
export type HookProfile = "minimal" | "standard" | "strict";
export interface HookConfig {
    id?: string;
    matcher?: string;
    command: string;
    timeout?: number;
    failAction?: "continue" | "abort" | "warn";
    profiles?: HookProfile[];
    async?: boolean;
    description?: string;
}
export interface HookResult {
    allow: boolean;
    message?: string;
    output?: string;
}
export interface HookContext {
    event: HookEvent;
    tool?: string;
    args?: string;
    filePath?: string;
    command?: string;
    content?: string;
    cwd?: string;
}
/**
 * Get all registered hooks for a given event from settings.
 */
export declare function getHooksForEvent(event: HookEvent, settings: MorningstarSettings): HookConfig[];
/**
 * Execute a hook command asynchronously.
 * Passes context as JSON on stdin.
 * Expects JSON output for decision control.
 */
export declare function executeHook(hook: HookConfig, context: HookContext): Promise<HookResult>;
/**
 * Execute a hook asynchronously (fire-and-forget, non-blocking).
 */
export declare function executeHookAsync(hook: HookConfig, context: HookContext): void;
/**
 * Execute all hooks for a given event.
 * Returns false if any hook aborts (allow: false).
 * Supports hook profiles and async execution.
 */
export declare function executeHooks(event: HookEvent, context: Omit<HookContext, "event">, settings: MorningstarSettings): Promise<{
    allowed: boolean;
    messages: string[];
}>;
/**
 * List all available hook events.
 */
export declare function listHookEvents(): string[];
/**
 * Format hooks display for /hooks command.
 */
export declare function formatHooksDisplay(settings: MorningstarSettings): string;
//# sourceMappingURL=hooks-system.d.ts.map