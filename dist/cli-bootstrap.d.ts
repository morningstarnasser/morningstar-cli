import type { CLIConfig } from "./types.js";
import type { MorningstarSettings } from "./settings.js";
export interface CLIOptionShape {
    apiKey?: string;
    model?: string;
    dir?: string;
    chat?: boolean;
    skipPermissions?: boolean;
    dangerouslySkipPermissions?: boolean;
    print?: string | boolean;
    outputFormat?: "text" | "json" | "stream-json";
    verbose?: boolean;
    quiet?: boolean;
    tools?: string;
    allowedTools?: string;
    disallowedTools?: string;
    maxTurns?: number;
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
}
export declare function loadSavedConfig(): Record<string, unknown>;
export declare function saveConfig(data: Record<string, unknown>): void;
export declare function loadEnvFile(dir: string): void;
export declare function createApiKeyHelpers(saved: Record<string, unknown>): {
    getStoredApiKey: (provider: string) => string;
    storeApiKey: (provider: string, key: string) => void;
};
export declare function buildCLIConfig(opts: CLIOptionShape, saved: Record<string, unknown>, projectSettings: MorningstarSettings, getStoredApiKey: (provider: string) => string): {
    cwd: string;
    chatOnly: boolean;
    skipPermissions: boolean;
    config: CLIConfig;
};
export declare function getSystemPromptOverride(opts: CLIOptionShape): string | undefined;
export declare function ensureApiKey(config: CLIConfig, opts: CLIOptionShape, getStoredApiKey: (provider: string) => string, storeApiKey: (provider: string, key: string) => void): Promise<void>;
//# sourceMappingURL=cli-bootstrap.d.ts.map