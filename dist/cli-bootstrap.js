import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { detectProvider, getProviderApiKeyEnv, getProviderBaseUrl } from "./providers.js";
import { loadProjectEnvFiles } from "./env.js";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const DEFAULT_CONFIG = {
    apiKey: "",
    model: "nvidia/moonshotai/kimi-k2.6",
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
        if (!existsSync(CONFIG_DIR)) {
            mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
        }
        try {
            chmodSync(CONFIG_DIR, 0o700);
        }
        catch { }
        const existing = loadSavedConfig();
        writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...data }, null, 2), { encoding: "utf-8", mode: 0o600 });
        try {
            chmodSync(CONFIG_FILE, 0o600);
        }
        catch { }
    }
    catch { }
}
export function loadEnvFile(dir) {
    loadProjectEnvFiles(dir);
}
function migrateLegacyApiKey(saved, savedApiKeys, persist) {
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
    }
    saved.apiKey = "";
    persist({ apiKeys: { ...savedApiKeys }, apiKey: "" });
}
export function createApiKeyHelpers(saved, persist = saveConfig) {
    const savedApiKeys = {
        ...(saved.apiKeys || {}),
    };
    migrateLegacyApiKey(saved, savedApiKeys, persist);
    function getStoredApiKey(provider) {
        if (provider === "ollama")
            return "ollama";
        if (savedApiKeys[provider])
            return savedApiKeys[provider];
        const envVar = getProviderApiKeyEnv(provider);
        return envVar && process.env[envVar] ? process.env[envVar] : "";
    }
    function storeApiKey(provider, key) {
        if (provider === "ollama" || provider === "hydra-local" || provider === "claude-cli") {
            return;
        }
        if (!key || key === "ollama")
            delete savedApiKeys[provider];
        else
            savedApiKeys[provider] = key;
        persist({ apiKeys: { ...savedApiKeys }, apiKey: "" });
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
    if (providerHint
        && (providerHint === detectedProvider
            || (providerHint === "openrouter" && selectedModel.includes("/")))) {
        selectedProvider = providerHint;
    }
    const canReuseSavedBaseUrl = !opts.model
        && savedModel === selectedModel
        && savedProvider === selectedProvider
        && typeof saved.baseUrl === "string";
    const config = {
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
/** Build an in-session model switch without carrying a credential across providers. */
export function buildModelSwitchConfig(config, model, provider, getStoredApiKey) {
    return {
        ...config,
        model,
        provider,
        baseUrl: getProviderBaseUrl(provider),
        apiKey: getStoredApiKey(provider),
    };
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
async function promptForSecret(label) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        const rl = createInterface({ input: process.stdin });
        return new Promise((resolvePrompt) => {
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
            if (!muted)
                process.stdout.write(chunk, encoding);
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
    return new Promise((resolvePrompt) => {
        rl.question("", (answer) => {
            muted = false;
            rl.close();
            process.stdout.write("\n");
            resolvePrompt(answer);
        });
    });
}
export async function ensureApiKey(config, opts, getStoredApiKey, storeApiKey) {
    if (config.apiKey && config.apiKey !== "ollama")
        return;
    if (config.provider === "ollama") {
        config.apiKey = "ollama";
        return;
    }
    // buildCLIConfig has already validated model/provider routing. Preserve its
    // explicit OpenRouter tuple for catalog IDs that resemble another provider.
    const providerName = config.provider || (config.model ? detectProvider(config.model) : "deepseek");
    if (providerName === "hydra-local" || providerName === "ollama") {
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
    if (envKey)
        console.log(`  Setze ${envKey} als Umgebungsvariable oder gib ihn hier ein.`);
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
//# sourceMappingURL=cli-bootstrap.js.map