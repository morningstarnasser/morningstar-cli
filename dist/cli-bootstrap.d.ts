import type { CLIConfig } from "./types.js";
import type { MorningstarSettings } from "./settings.js";
/**
 * Providers that never hold an API key: local runtimes and the vendor-CLI
 * bridges, whose credentials live inside the vendor CLI's own OAuth session.
 */
export declare const KEYLESS_PROVIDERS: ReadonlySet<string>;
export interface CLIOptionShape {
    apiKey?: string;
    model?: string;
    dir?: string;
    chat?: boolean;
    skipPermissions?: boolean;
    dangerouslySkipPermissions?: boolean;
    yolo?: boolean;
    print?: string | boolean;
    outputFormat?: "text" | "json" | "stream-json";
    verbose?: boolean;
    quiet?: boolean;
    tools?: string;
    allowedTools?: string;
    disallowedTools?: string;
    maxTurns?: number;
    autoKnowledge?: boolean;
    selfImprovement?: boolean;
    contextChars?: number;
    fallbackModel?: string;
    fast?: boolean;
    addDir?: string;
    permissionMode?: string;
    appendSystemPrompt?: string;
    agents?: string;
    jsonSchema?: string;
    debug?: boolean;
    maxBudgetUsd?: number;
    forkSession?: string;
    sessionId?: string;
    sandbox?: boolean;
    systemPrompt?: string;
    systemPromptFile?: string;
    appendSystemPromptFile?: string;
    settings?: string;
    settingSources?: string;
    inputFormat?: "text" | "stream-json";
    noSessionPersistence?: boolean;
    name?: string;
}
export declare function loadSavedConfig(): Record<string, unknown>;
export declare function saveConfig(data: Record<string, unknown>): void;
export declare function loadEnvFile(dir: string): void;
type SaveConfigFn = (data: Record<string, unknown>) => void;
export declare function createApiKeyHelpers(saved: Record<string, unknown>, persist?: SaveConfigFn): {
    getStoredApiKey: (provider: string) => string;
    storeApiKey: (provider: string, key: string) => void;
};
export declare function buildCLIConfig(opts: CLIOptionShape, saved: Record<string, unknown>, projectSettings: MorningstarSettings, getStoredApiKey: (provider: string) => string): {
    cwd: string;
    chatOnly: boolean;
    skipPermissions: boolean;
    config: CLIConfig;
};
/** Build an in-session model switch without carrying a credential across providers. */
export declare function buildModelSwitchConfig(config: CLIConfig, model: string, provider: string, getStoredApiKey: (provider: string) => string): CLIConfig;
export declare function getSystemPromptOverride(opts: CLIOptionShape): string | undefined;
export declare function ensureApiKey(config: CLIConfig, opts: CLIOptionShape, getStoredApiKey: (provider: string) => string, storeApiKey: (provider: string, key: string) => void): Promise<void>;
export {};
//# sourceMappingURL=cli-bootstrap.d.ts.map