import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { detectProvider, getProviderApiKeyEnv, getProviderBaseUrl } from "./providers.js";
import type { CLIConfig } from "./types.js";
import type { MorningstarSettings } from "./settings.js";

const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

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

const DEFAULT_CONFIG: CLIConfig = {
  apiKey: "",
  model: "nvidia/moonshotai/kimi-k2-instruct",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  maxTokens: 8192,
  temperature: 0.6,
  provider: "nvidia",
};

export function loadSavedConfig(): Record<string, unknown> {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Record<string, unknown>;
    }
  } catch {}
  return {};
}

export function saveConfig(data: Record<string, unknown>): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    const existing = loadSavedConfig();
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...data }, null, 2), "utf-8");
  } catch {}
}

export function loadEnvFile(dir: string): void {
  for (const name of [".env.local", ".env"]) {
    const envPath = join(dir, name);
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key]) process.env[key] = value;
      }
    } catch {}
  }
}

function migrateLegacyApiKey(saved: Record<string, unknown>, savedApiKeys: Record<string, string>): void {
  if (!saved.apiKey || typeof saved.apiKey !== "string" || saved.apiKey === "ollama") return;

  const legacyKey = saved.apiKey;
  const keyProvider =
    saved.provider && saved.provider !== "ollama"
      ? String(saved.provider)
      : legacyKey.startsWith("sk-ant-")
        ? "anthropic"
        : legacyKey.startsWith("sk-proj-") || legacyKey.startsWith("sk-org-")
          ? "openai"
          : legacyKey.startsWith("gsk_")
            ? "groq"
            : "deepseek";

  if (!savedApiKeys[keyProvider]) {
    savedApiKeys[keyProvider] = legacyKey;
    saveConfig({ apiKeys: savedApiKeys });
  }
}

export function createApiKeyHelpers(saved: Record<string, unknown>): {
  getStoredApiKey: (provider: string) => string;
  storeApiKey: (provider: string, key: string) => void;
} {
  const savedApiKeys: Record<string, string> = (saved.apiKeys as Record<string, string>) || {};
  migrateLegacyApiKey(saved, savedApiKeys);

  function getStoredApiKey(provider: string): string {
    if (provider === "ollama") return "ollama";
    if (savedApiKeys[provider]) return savedApiKeys[provider];
    const envVar = getProviderApiKeyEnv(provider);
    return envVar && process.env[envVar] ? process.env[envVar]! : "";
  }

  function storeApiKey(provider: string, key: string): void {
    if (provider === "ollama" || !key || key === "ollama") return;
    savedApiKeys[provider] = key;
    saveConfig({ apiKeys: savedApiKeys });
  }

  return { getStoredApiKey, storeApiKey };
}

function parseCsvFlag(value?: string): string[] | undefined {
  return value
    ? value.split(",").map((part) => part.trim()).filter(Boolean)
    : undefined;
}

export function buildCLIConfig(
  opts: CLIOptionShape,
  saved: Record<string, unknown>,
  projectSettings: MorningstarSettings,
  getStoredApiKey: (provider: string) => string,
): {
  cwd: string;
  chatOnly: boolean;
  skipPermissions: boolean;
  config: CLIConfig;
} {
  const cwd = resolve(opts.dir || process.cwd());
  const chatOnly = Boolean(opts.chat);
  const skipPermissions = Boolean(opts.skipPermissions || opts.dangerouslySkipPermissions);

  const selectedModel = opts.model || projectSettings.model || (saved.model as string) || DEFAULT_CONFIG.model;
  const selectedProvider = opts.model
    ? detectProvider(selectedModel)
    : projectSettings.provider || (saved.provider as string) || detectProvider(selectedModel);

  const config: CLIConfig = {
    ...DEFAULT_CONFIG,
    model: selectedModel,
    provider: selectedProvider,
    baseUrl: opts.model
      ? getProviderBaseUrl(selectedProvider)
      : ((saved.baseUrl as string) || getProviderBaseUrl(selectedProvider)),
    apiKey: opts.apiKey || getStoredApiKey(selectedProvider),
    temperature: projectSettings.temperature ?? DEFAULT_CONFIG.temperature,
    maxTokens: projectSettings.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    outputFormat: opts.outputFormat || "text",
    verbose: Boolean(opts.verbose),
    quiet: Boolean(opts.quiet),
    allowedTools: parseCsvFlag(opts.tools || opts.allowedTools),
    disallowedTools: parseCsvFlag(opts.disallowedTools),
    maxTurns: opts.maxTurns ?? undefined,
    fallbackModel: opts.fallbackModel || undefined,
    fast: Boolean(opts.fast),
    additionalDirs: opts.addDir ? [resolve(opts.addDir)] : undefined,
    dangerouslySkipPermissions: Boolean(opts.dangerouslySkipPermissions),
    permissionMode: opts.permissionMode || undefined,
    appendSystemPrompt: opts.appendSystemPrompt || undefined,
    preSelectedAgents: parseCsvFlag(opts.agents),
    jsonSchema: opts.jsonSchema || undefined,
    debug: Boolean(opts.debug),
    maxBudgetUsd: opts.maxBudgetUsd ?? undefined,
    forkSession: opts.forkSession || undefined,
    sessionId: opts.sessionId || undefined,
    sandbox: Boolean(opts.sandbox),
  };

  return { cwd, chatOnly, skipPermissions, config };
}

export function getSystemPromptOverride(opts: CLIOptionShape): string | undefined {
  if (opts.systemPrompt) return opts.systemPrompt;
  if (!opts.systemPromptFile) return undefined;
  try {
    return readFileSync(resolve(opts.systemPromptFile), "utf-8");
  } catch (error) {
    console.error(`Error reading system prompt file: ${(error as Error).message}`);
    process.exit(1);
  }
}

export async function ensureApiKey(
  config: CLIConfig,
  opts: CLIOptionShape,
  getStoredApiKey: (provider: string) => string,
  storeApiKey: (provider: string, key: string) => void,
): Promise<void> {
  if (config.apiKey && config.apiKey !== "ollama") return;
  if (config.provider === "ollama") {
    config.apiKey = "ollama";
    return;
  }

  const providerName = config.provider || "deepseek";
  const stored = getStoredApiKey(providerName);
  if (stored) {
    config.apiKey = stored;
    return;
  }

  if (opts.print !== undefined) {
    console.error(`No API key for ${providerName}. Set via --api-key or environment variable.`);
    process.exit(1);
  }

  const envKey = getProviderApiKeyEnv(providerName);
  console.log(`\n  Kein API Key fuer ${providerName} gefunden.\n`);
  if (envKey) console.log(`  Setze ${envKey} als Umgebungsvariable oder gib ihn hier ein.`);
  console.log("  Der Key wird dauerhaft gespeichert (pro Provider).\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolvePrompt) => {
    rl.question(`  ${providerName.toUpperCase()} API Key: `, (answer) => {
      rl.close();
      const key = answer.trim();
      if (!key) {
        console.log("\n  Kein Key eingegeben. Beende.\n");
        process.exit(1);
      }
      config.apiKey = key;
      storeApiKey(providerName, key);
      console.log(`\n  API Key fuer ${providerName} gespeichert.\n`);
      resolvePrompt();
    });
  });
}
