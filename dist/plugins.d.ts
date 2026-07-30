import { type PluginContext } from "./plugin-api.js";
export interface PluginManifest {
    name: string;
    version: string;
    description: string;
    author?: string;
    main: string;
    morningstarVersion?: string;
}
export interface LoadedPlugin {
    manifest: PluginManifest;
    path: string;
    loaded: boolean;
    error?: string;
}
/**
 * Discover plugins in the plugins directory.
 */
export declare function discoverPlugins(cwd?: string): PluginManifest[];
/**
 * Load all discovered plugins.
 */
export declare function loadPlugins(context: PluginContext, cwd?: string): Promise<LoadedPlugin[]>;
/**
 * Get list of loaded plugins.
 */
export declare function getLoadedPlugins(): LoadedPlugin[];
/**
 * Format plugins list for display.
 */
export declare function formatPluginsList(plugins: LoadedPlugin[]): string;
/**
 * Get plugin directory path (creates if needed).
 */
export declare function getPluginDir(global: boolean, cwd?: string): string;
//# sourceMappingURL=plugins.d.ts.map