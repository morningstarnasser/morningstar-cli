import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { detectProvider, getProviderApiKeyEnv, getProviderBaseUrl } from "./providers.js";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const DEFAULT_CONFIG = {
    apiKey: "",
    model: "nvidia/moonshotai/kimi-k2-instruct",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    maxTokens: 8192,
    temperature: 0.6,
    provider: "nvidia",
};
export function loadSavedConfig() {
    try {
        if (existsSync(CONFIG_FILE)) {
            return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
        }
    }
    catch { }
    return {};
}
export function saveConfig(data) {
    try {
        if (!existsSync(CONFIG_DIR))
            mkdirSync(CONFIG_DIR, { recursive: true });
        const existing = loadSavedConfig();
        writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...data }, null, 2), "utf-8");
    }
    catch { }
}
export function loadEnvFile(dir) {
    for (const name of [".env.local", ".env"]) {
        const envPath = join(dir, name);
        if (!existsSync(envPath))
            continue;
        try {
            const content = readFileSync(envPath, "utf-8");
            for (const line of content.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#"))
                    continue;
                const eqIdx = trimmed.indexOf("=");
                if (eqIdx === -1)
                    continue;
                const key = trimmed.slice(0, eqIdx).trim();
                const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
                if (key && !process.env[key])
                    process.env[key] = value;
            }
        }
        catch { }
    }
}
function migrateLegacyApiKey(saved, savedApiKeys) {
    if (!saved.apiKey || typeof saved.apiKey !== "string" || saved.apiKey === "ollama")
        return;
    const legacyKey = saved.apiKey;
    const keyProvider = saved.provider && saved.provider !== "ollama"
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
export function createApiKeyHelpers(saved) {
    const savedApiKeys = saved.apiKeys || {};
    migrateLegacyApiKey(saved, savedApiKeys);
    function getStoredApiKey(provider) {
        if (provider === "ollama")
            return "ollama";
        if (savedApiKeys[provider])
            return savedApiKeys[provider];
        const envVar = getProviderApiKeyEnv(provider);
        return envVar && process.env[envVar] ? process.env[envVar] : "";
    }
    function storeApiKey(provider, key) {
        if (provider === "ollama" || !key || key === "ollama")
            return;
        savedApiKeys[provider] = key;
        saveConfig({ apiKeys: savedApiKeys });
    }
    return { getStoredApiKey, storeApiKey };
}
function parseCsvFlag(value) {
    return value
        ? value.split(",").map((part) => part.trim()).filter(Boolean)
        : undefined;
}
export function buildCLIConfig(opts, saved, projectSettings, getStoredApiKey) {
    const cwd = resolve(opts.dir || process.cwd());
    const chatOnly = Boolean(opts.chat);
    const skipPermissions = Boolean(opts.skipPermissions || opts.dangerouslySkipPermissions);
    const selectedModel = opts.model || projectSettings.model || saved.model || DEFAULT_CONFIG.model;
    const selectedProvider = opts.model
        ? detectProvider(selectedModel)
        : projectSettings.provider || saved.provider || detectProvider(selectedModel);
    const config = {
        ...DEFAULT_CONFIG,
        model: selectedModel,
        provider: selectedProvider,
        baseUrl: opts.model
            ? getProviderBaseUrl(selectedProvider)
            : (saved.baseUrl || getProviderBaseUrl(selectedProvider)),
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
export function getSystemPromptOverride(opts) {
    if (opts.systemPrompt)
        return opts.systemPrompt;
    if (!opts.systemPromptFile)
        return undefined;
    try {
        return readFileSync(resolve(opts.systemPromptFile), "utf-8");
    }
    catch (error) {
        console.error(`Error reading system prompt file: ${error.message}`);
        process.exit(1);
    }
}
export async function ensureApiKey(config, opts, getStoredApiKey, storeApiKey) {
    if (config.apiKey && config.apiKey !== "ollama")
        return;
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
    if (envKey)
        console.log(`  Setze ${envKey} als Umgebungsvariable oder gib ihn hier ein.`);
    console.log("  Der Key wird dauerhaft gespeichert (pro Provider).\n");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((resolvePrompt) => {
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
//# sourceMappingURL=cli-bootstrap.js.map