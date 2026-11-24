import { type MorningstarSettings } from "./settings.js";
export type SettingSource = "user" | "project" | "local";
export interface SettingsLoadOptions {
    sources?: readonly SettingSource[];
    trustProject?: boolean;
    settings?: string;
    userPath?: string;
    managedPath?: string;
}
export interface SettingsResolution {
    settings: MorningstarSettings;
    files: Array<{
        scope: string;
        path: string;
        loaded: boolean;
    }>;
}
/** Validate the settings we execute; never turn malformed rules into empty permissions. */
export declare function parseSettings(value: unknown, source?: string): MorningstarSettings;
export declare function getManagedSettingsPath(): string;
export declare function resolveSettings(cwd: string, options?: SettingsLoadOptions): SettingsResolution;
export declare function loadSettings(cwd: string, options?: SettingsLoadOptions): MorningstarSettings;
//# sourceMappingURL=settings-sources.d.ts.map