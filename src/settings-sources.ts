import { existsSync, lstatSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { validateHooks } from "./runtime-hooks.js";
import { mergeSettings, type MorningstarSettings } from "./settings.js";

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
  files: Array<{ scope: string; path: string; loaded: boolean }>;
}
const MAX_SETTINGS_BYTES = 1_048_576;
const MODES = new Set(["ask", "default", "auto", "strict", "acceptEdits", "plan", "dontAsk", "delegate", "bypassPermissions"]);

function object(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
}

/** Validate the settings we execute; never turn malformed rules into empty permissions. */
export function parseSettings(value: unknown, source = "settings"): MorningstarSettings {
  object(value, source);
  const supported = new Set(["$schema", "permissions", "model", "provider", "temperature", "maxTokens", "customInstructions", "env", "allowedTools", "deniedTools", "hooks", "mcpServers", "allowManagedPermissionRulesOnly", "allowManagedHooksOnly", "disableAllHooks", "sandbox", "language", "outputStyle", "trustedHooks", "managedPermissionMode"]);
  const unknown = Object.keys(value).filter((key) => !supported.has(key));
  if (unknown.length) throw new Error(`${source}: unsupported settings: ${unknown.join(", ")}`);
  for (const key of ["model", "provider", "customInstructions", "language", "outputStyle"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") throw new Error(`${source}.${key} must be a string`);
  }

  if (value.permissions !== undefined) {
    object(value.permissions, `${source}.permissions`);
    const unknownPermissions = Object.keys(value.permissions).filter((key) => !["allow", "deny", "ask", "allowedCommands", "deniedCommands", "defaultMode", "disableBypassPermissionsMode"].includes(key));
    if (unknownPermissions.length) throw new Error(`${source}: unsupported permission controls: ${unknownPermissions.join(", ")}`);
    for (const key of ["allow", "deny", "ask", "allowedCommands", "deniedCommands"]) {
      const rules = value.permissions[key];
      if (rules !== undefined && (!Array.isArray(rules) || rules.some((x) => typeof x !== "string" || x.length > 4096))) {
        throw new Error(`${source}.permissions.${key} must be an array of strings`);
      }
    }
    const mode = value.permissions.defaultMode;
    if (mode !== undefined && (typeof mode !== "string" || !MODES.has(mode))) throw new Error(`${source}: invalid defaultMode`);
    const bypass = value.permissions.disableBypassPermissionsMode;
    if (bypass !== undefined && bypass !== "disable") throw new Error(`${source}: invalid disableBypassPermissionsMode`);
  }
  for (const key of ["allowedTools", "deniedTools"]) {
    const list = value[key];
    if (list !== undefined && (!Array.isArray(list) || list.some((x) => typeof x !== "string"))) throw new Error(`${source}.${key} must be a string array`);
  }
  for (const key of ["allowManagedPermissionRulesOnly", "allowManagedHooksOnly", "disableAllHooks"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") throw new Error(`${source}.${key} must be boolean`);
  }
  if (value.env !== undefined) {
    object(value.env, `${source}.env`);
    if (Object.values(value.env).some((x) => typeof x !== "string")) throw new Error(`${source}.env must contain strings`);
  }
  if (value.hooks !== undefined) validateHooks(value.hooks);
  if (value.mcpServers !== undefined) {
    object(value.mcpServers, `${source}.mcpServers`);
    for (const [name, server] of Object.entries(value.mcpServers)) {
      object(server, `MCP server ${name}`);
      if (server.autoConnect !== undefined && typeof server.autoConnect !== "boolean") throw new Error(`MCP ${name}: autoConnect must be boolean`);
      if (typeof server.command !== "string" || !server.command.trim() || Object.keys(server).some((key) => !["command", "args", "env", "type", "autoConnect"].includes(key)) || (server.type !== undefined && server.type !== "stdio")) throw new Error(`MCP ${name}: only stdio servers are supported`);
      if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some((arg) => typeof arg !== "string"))) throw new Error(`MCP ${name}: args must be strings`);
      if (server.env !== undefined) { object(server.env, `MCP ${name} env`); if (Object.values(server.env).some((x) => typeof x !== "string")) throw new Error(`MCP ${name}: env must contain strings`); }
    }
  }
  for (const key of ["temperature", "maxTokens"]) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) throw new Error(`${source}.${key} must be finite`);
  }
  if (value.sandbox !== undefined) {
    object(value.sandbox, `${source}.sandbox`);
    if (value.sandbox.enabled !== undefined && typeof value.sandbox.enabled !== "boolean") throw new Error(`${source}.sandbox.enabled must be boolean`);
    const unsupported = Object.keys(value.sandbox).filter((key) => key !== "enabled");
    if (unsupported.length) throw new Error(`${source}: unsupported sandbox controls: ${unsupported.join(", ")}; refusing to ignore isolation settings`);
  }
  const result = { ...value } as MorningstarSettings;
  delete result.managedPermissionMode;
  delete result.trustedHooks; // provenance is assigned by the loader, never by file contents
  return result;
}

function parseSettingsJson(text: string): unknown {
  if (Buffer.byteLength(text) > MAX_SETTINGS_BYTES) throw new Error("Settings exceed 1 MiB");
  try { return JSON.parse(text); }
  catch { throw new Error("Invalid settings JSON (values omitted)"); }
}

function readSettings(path: string): MorningstarSettings {
  let stat: ReturnType<typeof lstatSync>;
  try { stat = lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SETTINGS_BYTES) throw new Error(`Settings must be a regular file under 1 MiB: ${path}`);
  try { return parseSettings(parseSettingsJson(readFileSync(path, "utf8")), path); }
  catch (error) { throw new Error(`Cannot load settings: ${(error as Error).message}`); }
}

export function getManagedSettingsPath(): string {
  if (platform() === "darwin") return "/Library/Application Support/Morningstar/managed-settings.json";
  if (platform() === "win32") return join(process.env.ProgramData || "C:\\ProgramData", "Morningstar", "managed-settings.json");
  return "/etc/morningstar/managed-settings.json";
}

function trustedMerge(lower: MorningstarSettings, upper: MorningstarSettings): MorningstarSettings {
  return {
    ...mergeSettings(lower, upper),
    model: upper.model ?? lower.model,
    provider: upper.provider ?? lower.provider,
    permissions: {
      ...mergeSettings(lower, upper).permissions,
      defaultMode: upper.permissions?.defaultMode ?? lower.permissions?.defaultMode,
      disableBypassPermissionsMode: upper.permissions?.disableBypassPermissionsMode ?? lower.permissions?.disableBypassPermissionsMode,
    },
    mcpServers: { ...lower.mcpServers, ...upper.mcpServers },
    sandbox: upper.sandbox ?? lower.sandbox,
    disableAllHooks: upper.disableAllHooks ?? lower.disableAllHooks,
    trustedHooks: mergeSettings({ hooks: lower.trustedHooks ?? lower.hooks }, { hooks: upper.hooks }).hooks,
  };
}

export function resolveSettings(cwd: string, options: SettingsLoadOptions = {}): SettingsResolution {
  const sources = options.sources ?? ["user", "project", "local"];
  if (sources.some((x) => !["user", "project", "local"].includes(x))) throw new Error("setting sources must be user, project, local");
  const files: SettingsResolution["files"] = [];
  const read = (scope: string, path: string) => {
    files.push({ scope, path, loaded: existsSync(path) });
    return readSettings(path);
  };
  let settings: MorningstarSettings = sources.includes("user")
    ? read("user", options.userPath ?? join(homedir(), ".morningstar/settings.json")) : {};
  settings.trustedHooks = settings.hooks ?? {};
  const projectDir = join(cwd, ".morningstar");
  try {
    if (lstatSync(projectDir).isSymbolicLink()) throw new Error("Project settings directory must not be a symlink");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  for (const scope of ["project", "local"] as const) {
    if (!sources.includes(scope)) continue;
    const project = read(scope, join(projectDir, scope === "project" ? "settings.json" : "settings.local.json"));
    if (options.trustProject) settings = trustedMerge(settings, project);
    else {
      // Denials and questions may restrict an untrusted project; grants cannot.
      project.permissions = { deny: project.permissions?.deny, ask: project.permissions?.ask, deniedCommands: project.permissions?.deniedCommands };
      delete project.allowedTools;
      settings = mergeSettings(settings, project);
    }
  }
  if (options.settings !== undefined) {
    if (!options.settings.trim().startsWith("{") && !existsSync(options.settings)) throw new Error(`Explicit settings file missing: ${options.settings}`);
    const explicit = options.settings.trim().startsWith("{")
      ? parseSettings(parseSettingsJson(options.settings), "--settings") : read("explicit", options.settings);
    settings = trustedMerge(settings, explicit);
  }
  const managed = read("managed", options.managedPath ?? getManagedSettingsPath());
  settings = trustedMerge(settings, managed);
  settings.managedPermissionMode = managed.permissions?.defaultMode;
  settings.allowManagedPermissionRulesOnly = managed.allowManagedPermissionRulesOnly === true;
  settings.allowManagedHooksOnly = managed.allowManagedHooksOnly === true;
  if (settings.allowManagedPermissionRulesOnly) {
    settings.permissions = { ...managed.permissions };
    settings.allowedTools = managed.allowedTools;
    settings.deniedTools = managed.deniedTools;
  }
  if (settings.allowManagedHooksOnly) settings.trustedHooks = managed.hooks;
  if (settings.disableAllHooks) settings.trustedHooks = {};
  return { settings, files };
}

export function loadSettings(cwd: string, options: SettingsLoadOptions = {}): MorningstarSettings {
  return resolveSettings(cwd, options).settings;
}
