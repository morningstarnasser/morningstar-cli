export interface MorningstarSettings {
    permissions?: {
        allow?: string[];
        deny?: string[];
        ask?: string[];
        defaultMode?: string;
        disableBypassPermissionsMode?: "disable";
        allowedCommands?: string[];
        deniedCommands?: string[];
    };
    model?: string;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
    customInstructions?: string;
    env?: Record<string, string>;
    allowedTools?: string[];
    deniedTools?: string[];
    hooks?: import("./runtime-hooks.js").HookSettings;
    mcpServers?: Record<string, import("./mcp-client.js").MCPServerConfig>;
    allowManagedPermissionRulesOnly?: boolean;
    allowManagedHooksOnly?: boolean;
    disableAllHooks?: boolean;
    sandbox?: {
        enabled?: boolean;
    };
    language?: string;
    outputStyle?: string;
    /** Commands from user/managed/explicit settings only, never repository files. */
    trustedHooks?: import("./runtime-hooks.js").HookSettings;
    managedPermissionMode?: string;
}
export declare function getGlobalSettingsPath(): string;
export declare function getProjectSettingsPath(cwd: string): string;
export declare function projectSettingsExist(cwd: string): boolean;
export declare function loadGlobalSettings(): MorningstarSettings;
export declare function loadProjectSettings(cwd: string): MorningstarSettings;
export declare function mergeSettings(global: MorningstarSettings, local: MorningstarSettings): MorningstarSettings;
export { loadSettings } from "./settings-sources.js";
export declare function initProjectSettings(cwd: string): string;
export declare function isToolAllowed(tool: string, settings: MorningstarSettings): "allow" | "deny" | "ask";
export declare function isCommandAllowed(command: string, settings: MorningstarSettings): "allow" | "deny" | "ask";
type SettingKey = "allow" | "deny" | "allowedCommands" | "deniedCommands";
export declare function addToProjectSetting(cwd: string, key: SettingKey, value: string): void;
//# sourceMappingURL=settings.d.ts.map