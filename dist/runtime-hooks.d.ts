export type RuntimeHookEvent = "SessionStart" | "SessionEnd" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "Stop";
export interface CommandHook {
    type?: "command";
    command: string;
    timeout?: number;
    async?: boolean;
}
export interface HookEntry extends Partial<CommandHook> {
    matcher?: string;
    hooks?: CommandHook[];
}
export type HookSettings = Record<string, HookEntry[]>;
/** Reject unsupported execution semantics instead of pretending a policy ran. */
export declare function validateHooks(value: unknown): asserts value is HookSettings;
export interface RuntimeHookContext {
    cwd: string;
    session_id?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_response?: unknown;
    prompt?: string;
    reason?: string;
}
/** Called only with loader-assigned trustedHooks, after authorization for tool events. */
export declare function runRuntimeHooks(hooks: HookSettings | undefined, event: RuntimeHookEvent, context: RuntimeHookContext, signal?: AbortSignal): Promise<{
    allowed: boolean;
    messages: string[];
}>;
//# sourceMappingURL=runtime-hooks.d.ts.map