export interface MorningstarSettings {
    permissions?: {
        allow?: string[];
        deny?: string[];
        allowedCommands?: string[];
        deniedCommands?: string[];
    };
    model?: string;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
    customInstructions?: string;
    env?: Record<string, string>;
}
export declare function getGlobalSettingsPath(): string;
export declare function getProjectSettingsPath(cwd: string): string;
export declare function projectSettingsExist(cwd: string): boolean;
export declare function loadGlobalSettings(): MorningstarSettings;
export declare function loadProjectSettings(cwd: string): MorningstarSettings;
export declare function mergeSettings(global: MorningstarSettings, local: MorningstarSettings): MorningstarSettings;
export declare function loadSettings(cwd: string): MorningstarSettings;
export declare function initProjectSettings(cwd: string): string;
export declare function isToolAllowed(tool: string, settings: MorningstarSettings): "allow" | "deny" | "ask";
export declare function isCommandAllowed(command: string, settings: MorningstarSettings): "allow" | "deny" | "ask";
type SettingKey = "allow" | "deny" | "allowedCommands" | "deniedCommands";
export declare function addToProjectSetting(cwd: string, key: SettingKey, value: string): void;
export {};
//# sourceMappingURL=settings.d.ts.map