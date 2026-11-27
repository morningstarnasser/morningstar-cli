import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { detectProvider, getProviderApiKeyEnv, getProviderBaseUrl } from "./providers.js";
import { loadProjectEnvFiles } from "./env.js";
import type { CLIConfig } from "./types.js";
import type { MorningstarSettings } from "./settings.js";

const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Providers that never hold an API key: local runtimes and the vendor-CLI
 * bridges, whose credentials live inside the vendor CLI's own OAuth session.
 */
export const KEYLESS_PROVIDERS: ReadonlySet<string> = new Set([
  "ollama",
  "hydra-local",
  "claude-cli",
  "codex-cli",
]);

export interface CLIOptionShape {
  channels?: string;
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

const DEFAULT_CONFIG: CLIConfig = {
  apiKey: "",
  model: "nvidia/moonshotai/kimi-k2.6",
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
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    try { chmodSync(CONFIG_DIR, 0o700); } catch {}
    const existing = loadSavedConfig();
    writeFileSync(
      CONFIG_FILE,
      JSON.stringify({ ...existing, ...data }, null, 2),
      { encoding: "utf-8", mode: 0o600 },
    );
    try { chmodSync(CONFIG_FILE, 0o600); } catch {}
  } catch {}
}

export function loadEnvFile(dir: string): void {
  loadProjectEnvFiles(dir);
}

type SaveConfigFn = (data: Record<string, unknown>) => void;

function migrateLegacyApiKey(
  saved: Record<string, unknown>,
  savedApiKeys: Record<string, string>,
  persist: SaveConfigFn,
): void {
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
  }
  saved.apiKey = "";
  persist({ apiKeys: { ...savedApiKeys }, apiKey: "" });
}

export function createApiKeyHelpers(
  saved: Record<string, unknown>,
  persist: SaveConfigFn = saveConfig,
): {
  getStoredApiKey: (provider: string) => string;
  storeApiKey: (provider: string, key: string) => void;
} {
  const savedApiKeys: Record<string, string> = {
    ...((saved.apiKeys as Record<string, string>) || {}),
  };
  migrateLegacyApiKey(saved, savedApiKeys, persist);

  function getStoredApiKey(provider: string): string {
    if (provider === "ollama") return "ollama";
    if (savedApiKeys[provider]) return savedApiKeys[provider];
    const envVar = getProviderApiKeyEnv(provider);
    return envVar && process.env[envVar] ? process.env[envVar]! : "";
  }

  function storeApiKey(provider: string, key: string): void {
    if (KEYLESS_PROVIDERS.has(provider)) return;
    if (!key || key === "ollama") delete savedApiKeys[provider];
    else savedApiKeys[provider] = key;
    persist({ apiKeys: { ...savedApiKeys }, apiKey: "" });
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
  const skipPermissions = Boolean(opts.yolo || opts.skipPermissions || opts.dangerouslySkipPermissions);
  const disableBypass = projectSettings.permissions?.disableBypassPermissionsMode === "disable" || Boolean(projectSettings.managedPermissionMode && projectSettings.managedPermissionMode !== "bypassPermissions");
  if (disableBypass && (skipPermissions || opts.permissionMode === "bypassPermissions")) {
    throw new Error("Bypass permissions is disabled by settings");
  }
  if (opts.sessionId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(opts.sessionId)) throw new Error("Invalid session-id");
  if (opts.maxTurns !== undefined && (!Number.isSafeInteger(opts.maxTurns) || opts.maxTurns < 0)) throw new Error("max-turns must be a non-negative integer (0 = unlimited)");
  if (opts.contextChars !== undefined && (!Number.isSafeInteger(opts.contextChars) || opts.contextChars < 4000)) throw new Error("context-chars must be an integer >= 4000");
  if (opts.maxBudgetUsd !== undefined && (!Number.isFinite(opts.maxBudgetUsd) || opts.maxBudgetUsd <= 0)) throw new Error("max-budget-usd must be positive");
  if (opts.permissionMode && !["default", "auto", "ask", "strict", "bypassPermissions", "acceptEdits", "plan", "dontAsk", "delegate"].includes(opts.permissionMode)) throw new Error("Invalid permission mode");
  const managedOnly = projectSettings.allowManagedPermissionRulesOnly === true;
  const rules = (values: Array<readonly string[] | undefined>): string[] | undefined => {
    const merged = [...new Set(values.flatMap((v) => v ?? []))];
    return merged.length ? merged : undefined;
  };

  const selectedModel = opts.model || projectSettings.model || (saved.model as string) || DEFAULT_CONFIG.model;
  const savedModel = typeof saved.model === "string" ? saved.model : undefined;
  const savedProvider = typeof saved.provider === "string" ? saved.provider : undefined;
  const projectProvider = typeof projectSettings.provider === "string"
    ? projectSettings.provider
    : undefined;
  const providerHint = opts.model
    ? undefined
    : projectSettings.model === selectedModel
      ? projectProvider
      : savedModel === selectedModel
        ? savedProvider
        : undefined;
  const detectedProvider = detectProvider(selectedModel);
  // Most model IDs identify their provider directly. OpenRouter is the one
  // intentional ambiguity: its catalog can contain nvidia/... or groq/... IDs,
  // so the persisted provider/model tuple must win for that exact selection.
  let selectedProvider = detectedProvider;
  if (
    providerHint
    && (
      providerHint === detectedProvider
      || (providerHint === "openrouter" && selectedModel.includes("/"))
    )
  ) {
    selectedProvider = providerHint;
  }
  const canReuseSavedBaseUrl = !opts.model
    && savedModel === selectedModel
    && savedProvider === selectedProvider
    && typeof saved.baseUrl === "string";

  const config: CLIConfig = {
    telegramChannel: opts.channels?.split(",").includes("telegram"),
    ...DEFAULT_CONFIG,
    model: selectedModel,
    provider: selectedProvider,
    baseUrl: canReuseSavedBaseUrl
      ? String(saved.baseUrl)
      : getProviderBaseUrl(selectedProvider),
    apiKey: opts.apiKey || getStoredApiKey(selectedProvider),
    temperature: projectSettings.temperature ?? DEFAULT_CONFIG.temperature,
    maxTokens: projectSettings.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    outputFormat: opts.outputFormat || "text",
    verbose: Boolean(opts.verbose),
    quiet: Boolean(opts.quiet),
    allowedTools: rules([managedOnly ? undefined : parseCsvFlag(opts.allowedTools), projectSettings.allowedTools, projectSettings.permissions?.allow, projectSettings.permissions?.allowedCommands?.map((x) => `Bash(${x})`)]),
    disallowedTools: rules([parseCsvFlag(opts.disallowedTools), projectSettings.deniedTools, projectSettings.permissions?.deny, projectSettings.permissions?.deniedCommands?.map((x) => `Bash(${x})`)]),
    askTools: projectSettings.permissions?.ask,
    toolAllowlist: chatOnly ? [] : opts.tools !== undefined ? parseCsvFlag(opts.tools) ?? [] : undefined,
    disableBypassPermissions: disableBypass,
    runtimeSettings: projectSettings,
    maxTurns: opts.maxTurns ?? undefined,
    autoKnowledge: opts.autoKnowledge !== false,
    selfImprovement: opts.selfImprovement !== false && saved.selfImprovement !== false,
    contextChars: opts.contextChars,
    fallbackModel: opts.fallbackModel || undefined,
    fast: Boolean(opts.fast),
    additionalDirs: opts.addDir ? [resolve(opts.addDir)] : undefined,
    dangerouslySkipPermissions: skipPermissions,
    yolo: Boolean(opts.yolo),
    permissionMode: (projectSettings.managedPermissionMode || opts.permissionMode || projectSettings.permissions?.defaultMode)?.replace(/^default$/, "ask"),
    appendSystemPrompt: [opts.appendSystemPrompt, opts.appendSystemPromptFile ? readFileSync(opts.appendSystemPromptFile, "utf8") : undefined].filter(Boolean).join("\n\n") || undefined,
    preSelectedAgents: parseCsvFlag(opts.agents),
    jsonSchema: opts.jsonSchema || undefined,
    debug: Boolean(opts.debug),
    maxBudgetUsd: opts.maxBudgetUsd ?? undefined,
    forkSession: opts.forkSession || undefined,
    sessionId: opts.sessionId || undefined,
    sandbox: Boolean(opts.sandbox || projectSettings.sandbox?.enabled),
    inputFormat: opts.inputFormat ?? "text",
    noSessionPersistence: Boolean(opts.noSessionPersistence),
    sessionName: opts.name,
  };

  return { cwd, chatOnly, skipPermissions, config };
}

/** Build an in-session model switch without carrying a credential across providers. */
export function buildModelSwitchConfig(
  config: CLIConfig,
  model: string,
  provider: string,
  getStoredApiKey: (provider: string) => string,
): CLIConfig {
  return {
    ...config,
    model,
    provider,
    baseUrl: provider === "ollama" && config.provider === "ollama" && config.baseUrl
      ? config.baseUrl : getProviderBaseUrl(provider),
    apiKey: getStoredApiKey(provider),
  };
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

async function promptForSecret(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const rl = createInterface({ input: process.stdin });
    return new Promise<string>((resolvePrompt) => {
      process.stdout.write(label);
      rl.question("", (answer) => {
        rl.close();
        process.stdout.write("\n");
        resolvePrompt(answer);
      });
    });
  }

  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding as BufferEncoding);
      callback();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });

  process.stdout.write(label);
  muted = true;
  return new Promise<string>((resolvePrompt) => {
    rl.question("", (answer) => {
      muted = false;
      rl.close();
      process.stdout.write("\n");
      resolvePrompt(answer);
    });
  });
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

  // buildCLIConfig has already validated model/provider routing. Preserve its
  // explicit OpenRouter tuple for catalog IDs that resemble another provider.
  const providerName = config.provider || (config.model ? detectProvider(config.model) : "deepseek");
  // Local runtimes and vendor-CLI bridges authenticate elsewhere — prompting
  // for an API key here would be a dead end the user cannot satisfy.
  if (KEYLESS_PROVIDERS.has(providerName)) {
    config.provider = providerName;
    config.apiKey = providerName === "ollama" ? "ollama" : "local";
    return;
  }
  const stored = getStoredApiKey(providerName);
  if (stored) {
    config.apiKey = stored;
    return;
  }

  if (opts.print !== undefined) {
    console.error(`No API key for ${providerName}. Set ${getProviderApiKeyEnv(providerName) || "the provider API-key environment variable"}.`);
    process.exit(1);
  }

  const envKey = getProviderApiKeyEnv(providerName);
  console.log(`\n  Kein API Key fuer ${providerName} gefunden.\n`);
  if (envKey) console.log(`  Setze ${envKey} als Umgebungsvariable oder gib ihn hier ein.`);
  console.log("  Der Key wird dauerhaft gespeichert (pro Provider).\n");

  const key = (await promptForSecret(`  ${providerName.toUpperCase()} API Key: `)).trim();
  if (!key) {
    console.log("\n  Kein Key eingegeben. Beende.\n");
    process.exit(1);
  }
  config.apiKey = key;
  storeApiKey(providerName, key);
  console.log(`\n  API Key fuer ${providerName} gespeichert.\n`);
}
