// ─── Plugin System ───────────────────────────────────────
// Plugin discovery, loading, and lifecycle management

import { existsSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createPluginAPI, clearPluginRegistry, type PluginContext } from "./plugin-api.js";

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

const GLOBAL_PLUGINS_DIR = join(homedir(), ".morningstar", "plugins");

const loadedPlugins: LoadedPlugin[] = [];

/**
 * Discover plugins in the plugins directory.
 */
export function discoverPlugins(cwd?: string): PluginManifest[] {
  const plugins: PluginManifest[] = [];
  const dirs = [GLOBAL_PLUGINS_DIR];
  if (cwd) dirs.push(join(cwd, ".morningstar", "plugins"));

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = join(dir, entry.name, "package.json");
        if (!existsSync(manifestPath)) continue;

        try {
          const raw = readFileSync(manifestPath, "utf-8");
          const manifest = JSON.parse(raw) as PluginManifest;
          if (manifest.name && manifest.main) {
            plugins.push(manifest);
          }
        } catch {}
      }
    } catch {}
  }

  return plugins;
}

/**
 * Load all discovered plugins.
 */
export async function loadPlugins(context: PluginContext, cwd?: string): Promise<LoadedPlugin[]> {
  clearPluginRegistry();
  loadedPlugins.length = 0;

  const dirs = [GLOBAL_PLUGINS_DIR];
  if (cwd) dirs.push(join(cwd, ".morningstar", "plugins"));

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginDir = join(dir, entry.name);
        const manifestPath = join(pluginDir, "package.json");
        if (!existsSync(manifestPath)) continue;

        try {
          const raw = readFileSync(manifestPath, "utf-8");
          const manifest = JSON.parse(raw) as PluginManifest;
          const mainPath = resolve(pluginDir, manifest.main);

          if (!existsSync(mainPath)) {
            loadedPlugins.push({ manifest, path: pluginDir, loaded: false, error: `Main file not found: ${manifest.main}` });
            continue;
          }

          try {
            const pluginModule = await import(mainPath);
            const api = createPluginAPI(context);
            if (typeof pluginModule.activate === "function") {
              await pluginModule.activate(api);
            } else if (typeof pluginModule.default === "function") {
              await pluginModule.default(api);
            }
            loadedPlugins.push({ manifest, path: pluginDir, loaded: true });
          } catch (e) {
            loadedPlugins.push({ manifest, path: pluginDir, loaded: false, error: (e as Error).message });
          }
        } catch (e) {
          loadedPlugins.push({
            manifest: { name: entry.name, version: "?", description: "Parse error", main: "" },
            path: pluginDir,
            loaded: false,
            error: (e as Error).message,
          });
        }
      }
    } catch {}
  }

  return loadedPlugins;
}

/**
 * Get list of loaded plugins.
 */
export function getLoadedPlugins(): LoadedPlugin[] {
  return [...loadedPlugins];
}

/**
 * Format plugins list for display.
 */
export function formatPluginsList(plugins: LoadedPlugin[]): string {
  if (plugins.length === 0) return "  Keine Plugins geladen.";

  return plugins
    .map(p => {
      const status = p.loaded ? "aktiv" : "fehler";
      const icon = p.loaded ? "✓" : "✗";
      let line = `  ${icon} ${p.manifest.name}@${p.manifest.version} [${status}]`;
      line += `\n    ${p.manifest.description}`;
      if (p.error) line += `\n    Fehler: ${p.error}`;
      return line;
    })
    .join("\n\n");
}

/**
 * Get plugin directory path (creates if needed).
 */
export function getPluginDir(global: boolean, cwd?: string): string {
  const dir = global
    ? GLOBAL_PLUGINS_DIR
    : join(cwd || process.cwd(), ".morningstar", "plugins");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
