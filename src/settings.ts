import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Types ──────────────────────────────────────────────────

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
  // Claude Code-compatible extensions:
  allowedTools?: string[];
  deniedTools?: string[];
  hooks?: Record<string, Array<{ matcher?: string; command: string }>>;
  mcpServers?: Record<string, { command: string; args?: string[] }>;
}

// ─── Paths ──────────────────────────────────────────────────

const GLOBAL_DIR = join(homedir(), ".morningstar");
const GLOBAL_SETTINGS = join(GLOBAL_DIR, "settings.json");

export function getGlobalSettingsPath(): string { return GLOBAL_SETTINGS; }
export function getProjectSettingsPath(cwd: string): string {
  return join(cwd, ".morningstar", "settings.local.json");
}
export function projectSettingsExist(cwd: string): boolean {
  return existsSync(getProjectSettingsPath(cwd));
}

// ─── Load ───────────────────────────────────────────────────

export function loadGlobalSettings(): MorningstarSettings {
  try {
    if (existsSync(GLOBAL_SETTINGS)) {
      return JSON.parse(readFileSync(GLOBAL_SETTINGS, "utf-8"));
    }
  } catch {}
  return {};
}

export function loadProjectSettings(cwd: string): MorningstarSettings {
  const path = getProjectSettingsPath(cwd);
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch {}
  return {};
}

// ─── Merge ──────────────────────────────────────────────────

function mergeArrays(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) return undefined;
  return [...new Set([...(a || []), ...(b || [])])];
}

export function mergeSettings(global: MorningstarSettings, local: MorningstarSettings): MorningstarSettings {
  // Merge hooks: combine arrays for same event
  const mergedHooks: Record<string, Array<{ matcher?: string; command: string }>> = {};
  for (const [event, hooks] of Object.entries(global.hooks || {})) {
    mergedHooks[event] = [...hooks];
  }
  for (const [event, hooks] of Object.entries(local.hooks || {})) {
    mergedHooks[event] = [...(mergedHooks[event] || []), ...hooks];
  }

  return {
    permissions: {
      allow: mergeArrays(global.permissions?.allow, local.permissions?.allow),
      deny: mergeArrays(global.permissions?.deny, local.permissions?.deny),
      allowedCommands: mergeArrays(global.permissions?.allowedCommands, local.permissions?.allowedCommands),
      deniedCommands: mergeArrays(global.permissions?.deniedCommands, local.permissions?.deniedCommands),
    },
    model: local.model ?? global.model,
    provider: local.provider ?? global.provider,
    temperature: local.temperature ?? global.temperature,
    maxTokens: local.maxTokens ?? global.maxTokens,
    customInstructions: [global.customInstructions, local.customInstructions].filter(Boolean).join("\n") || undefined,
    env: { ...(global.env || {}), ...(local.env || {}) },
    allowedTools: mergeArrays(global.allowedTools, local.allowedTools),
    deniedTools: mergeArrays(global.deniedTools, local.deniedTools),
    hooks: Object.keys(mergedHooks).length > 0 ? mergedHooks : undefined,
    mcpServers: { ...(global.mcpServers || {}), ...(local.mcpServers || {}) },
  };
}

export function loadSettings(cwd: string): MorningstarSettings {
  return mergeSettings(loadGlobalSettings(), loadProjectSettings(cwd));
}

// ─── Init ───────────────────────────────────────────────────

const DEFAULT_SETTINGS: MorningstarSettings = {
  permissions: {
    allow: ["read", "write", "edit", "ls", "glob", "grep", "git"],
    deny: [],
    allowedCommands: ["npm test", "npm run *", "npx *", "git *", "node *", "tsc *"],
    deniedCommands: ["rm -rf /", "sudo *", "chmod -R 777 *"],
  },
  customInstructions: "",
  env: {},
};

export function initProjectSettings(cwd: string): string {
  const dir = join(cwd, ".morningstar");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, "settings.local.json");
  writeFileSync(path, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf-8");

  // Add to .gitignore if it exists
  const gitignore = join(cwd, ".gitignore");
  if (existsSync(gitignore)) {
    const content = readFileSync(gitignore, "utf-8");
    if (!content.includes(".morningstar/")) {
      writeFileSync(gitignore, content.trimEnd() + "\n.morningstar/\n", "utf-8");
    }
  }
  return path;
}

// ─── Permission Checks ─────────────────────────────────────

export function isToolAllowed(tool: string, settings: MorningstarSettings): "allow" | "deny" | "ask" {
  if (settings.permissions?.deny?.includes(tool)) return "deny";
  if (settings.permissions?.allow?.includes(tool)) return "allow";
  return "ask";
}

function matchCommand(pattern: string, command: string): boolean {
  if (pattern === command) return true;
  if (pattern.endsWith(" *")) {
    const prefix = pattern.slice(0, -2);
    return command === prefix || command.startsWith(prefix + " ");
  }
  return false;
}

export function isCommandAllowed(command: string, settings: MorningstarSettings): "allow" | "deny" | "ask" {
  const cmd = command.trim();
  // Deny takes priority
  for (const pat of settings.permissions?.deniedCommands || []) {
    if (matchCommand(pat, cmd)) return "deny";
  }
  for (const pat of settings.permissions?.allowedCommands || []) {
    if (matchCommand(pat, cmd)) return "allow";
  }
  return "ask";
}

// ─── Mutation ───────────────────────────────────────────────

type SettingKey = "allow" | "deny" | "allowedCommands" | "deniedCommands";

export function addToProjectSetting(cwd: string, key: SettingKey, value: string): void {
  const path = getProjectSettingsPath(cwd);
  let settings: MorningstarSettings = {};
  try {
    if (existsSync(path)) settings = JSON.parse(readFileSync(path, "utf-8"));
  } catch {}
  if (!settings.permissions) settings.permissions = {};
  const list = settings.permissions[key] || [];
  if (!list.includes(value)) list.push(value);
  settings.permissions[key] = list;
  const dir = join(cwd, ".morningstar");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
}
