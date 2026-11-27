import { getOllamaBaseUrl } from "./runtime/ollama-endpoint.js";
import { getFreeModelsApiKey, getFreeModelsBaseUrl } from "./runtime/free-models.js";
export { getOllamaBaseUrl } from "./runtime/ollama-endpoint.js";
import { imageData, conversationImages } from "./runtime/images.js";
import { execFileSync } from "child_process";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { getAnthropicToolDefinitions, getGoogleToolDefinitions, getOpenAIToolDefinitions, } from "./tool-definitions.js";
import { claudeCliStream } from "./providers/claude-cli.js";
import { openCodeCliStream } from "./providers/opencode-cli.js";
import { codexCliStream, getCodexModelDisplayName, listCodexModels, } from "./providers/codex-cli.js";
import { getDiscoveredProviderModels, getProviderModelEndpoint } from "./provider-model-discovery.js";
import { selectRequestTools } from "./runtime/tool-discovery.js";
export const PROVIDER_NAMES = [
    "deepseek",
    "openai",
    "anthropic",
    "google",
    "nvidia",
    "github-models",
    "hydra-local",
    "ollama",
    "claude-cli",
    "codex-cli",
    "groq",
    "openrouter",
    "free-models",
    "opencode",
];
const KNOWN_PROVIDER_NAMES = new Set(PROVIDER_NAMES);
export function resolveModelSelectionArg(input) {
    const [candidateProvider, ...modelParts] = input.trim().split(/\s+/);
    if (modelParts.length > 0
        && KNOWN_PROVIDER_NAMES.has(candidateProvider.toLowerCase())) {
        return {
            provider: candidateProvider.toLowerCase(),
            model: modelParts.join(" "),
        };
    }
    return { model: input.trim(), provider: detectProvider(input.trim()) };
}
// Providers that support native function calling
const NATIVE_TOOL_PROVIDERS = new Set(["openai", "anthropic", "google", "groq", "openrouter", "nvidia", "github-models", "ollama", "free-models"]);
/**
 * Serialize provider-neutral native tool turns into OpenAI-compatible chat
 * messages while retaining every call id.
 */
export function serializeOpenAIMessages(messages) {
    conversationImages(messages);
    return messages.map((message) => {
        if (message.role === "tool") {
            return {
                role: "tool",
                tool_call_id: message.toolCallId,
                name: message.toolName,
                content: message.content,
            };
        }
        if (message.role === "assistant" && message.toolCalls?.length) {
            return {
                role: "assistant",
                content: message.content || null,
                tool_calls: message.toolCalls.map((call) => ({
                    id: call.id,
                    type: "function",
                    function: {
                        name: call.name,
                        arguments: JSON.stringify(call.arguments),
                    },
                })),
            };
        }
        if (message.role === "user" && message.images?.length)
            return { role: "user", content: [
                    { type: "text", text: message.content },
                    ...message.images.map(image => ({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${imageData(image)}` } })),
                ] };
        return { role: message.role, content: message.content };
    });
}
function appendAnthropicMessage(target, role, blocks) {
    if (blocks.length === 0)
        return;
    const previous = target[target.length - 1];
    if (previous?.role === role) {
        target[target.length - 1] = {
            role,
            content: [...previous.content, ...blocks],
        };
        return;
    }
    target.push({ role, content: blocks });
}
/** Serialize native turns into Anthropic tool_use/tool_result content blocks. */
export function serializeAnthropicMessages(messages) {
    conversationImages(messages);
    const serialized = [];
    for (const message of messages) {
        if (message.role === "system")
            continue;
        if (message.role === "tool") {
            appendAnthropicMessage(serialized, "user", [{
                    type: "tool_result",
                    tool_use_id: message.toolCallId,
                    content: message.content,
                    is_error: message.isError === true,
                }]);
            continue;
        }
        const blocks = [];
        if (message.content)
            blocks.push({ type: "text", text: message.content });
        if (message.role === "user")
            for (const image of message.images ?? [])
                blocks.push({ type: "image", source: { type: "base64", media_type: image.mimeType, data: imageData(image) } });
        for (const call of message.toolCalls ?? []) {
            blocks.push({
                type: "tool_use",
                id: call.id,
                name: call.name,
                input: call.arguments,
            });
        }
        appendAnthropicMessage(serialized, message.role === "assistant" ? "assistant" : "user", blocks);
    }
    return serialized;
}
function appendGeminiContent(target, role, parts) {
    if (parts.length === 0)
        return;
    const previous = target[target.length - 1];
    if (previous?.role === role) {
        target[target.length - 1] = { role, parts: [...previous.parts, ...parts] };
        return;
    }
    target.push({ role, parts });
}
/** Serialize native turns into Gemini functionCall/functionResponse parts. */
export function serializeGeminiMessages(messages) {
    conversationImages(messages);
    const serialized = [];
    for (const message of messages) {
        if (message.role === "system")
            continue;
        if (message.role === "tool") {
            appendGeminiContent(serialized, "user", [{
                    functionResponse: {
                        name: message.toolName,
                        response: {
                            result: message.content,
                            success: message.isError !== true,
                        },
                    },
                }]);
            continue;
        }
        const parts = [];
        if (message.content)
            parts.push({ text: message.content });
        if (message.role === "user")
            for (const image of message.images ?? [])
                parts.push({ inlineData: { mimeType: image.mimeType, data: imageData(image) } });
        for (const call of message.toolCalls ?? []) {
            parts.push({
                functionCall: {
                    name: call.name,
                    args: call.arguments,
                },
            });
        }
        appendGeminiContent(serialized, message.role === "assistant" ? "model" : "user", parts);
    }
    return serialized;
}
// ─── Provider Detection ──────────────────────────────────
// Short-lived cache: model pulls/removals become visible in the picker without
// spawning `ollama list` on every provider detection.
let _ollamaModels = null;
let _ollamaModelsReadAt = 0;
let _ollamaModelsCacheKey = "";
const MAX_OLLAMA_MODELS = 2_000;
const MAX_OLLAMA_MANIFEST_DEPTH = 12;
function isSafeOllamaModelId(value) {
    return typeof value === "string"
        && value.length > 0
        && value.length <= 256
        && /^[A-Za-z0-9][A-Za-z0-9._:/@+~-]*$/.test(value);
}
export function parseOllamaListOutput(output) {
    return output
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/)[0])
        .filter(isSafeOllamaModelId)
        .slice(0, MAX_OLLAMA_MODELS);
}
/**
 * Convert one Ollama manifest file into the exact model id accepted by the
 * local API. The first path segment is the registry, the last one is the tag.
 *
 * Examples:
 *   registry.ollama.ai/library/qwen3/latest -> qwen3:latest
 *   registry.ollama.ai/acme/model/q4       -> acme/model:q4
 *   hf.co/org/repo/Q4_K_M                  -> hf.co/org/repo:Q4_K_M
 */
export function parseOllamaManifestPath(manifestPath) {
    const segments = manifestPath
        .split(/[\\/]+/)
        .map((segment) => segment.trim())
        .filter(Boolean);
    if (segments.length < 3 || segments.some((segment) => segment === "." || segment === "..")) {
        return null;
    }
    const registry = segments[0];
    const tag = segments.at(-1);
    let modelSegments = segments.slice(1, -1);
    if (registry === "registry.ollama.ai" && modelSegments[0] === "library") {
        modelSegments = modelSegments.slice(1);
    }
    if (modelSegments.length === 0 || !tag)
        return null;
    const model = modelSegments.join("/");
    const resolved = registry === "registry.ollama.ai"
        ? `${model}:${tag}`
        : `${registry}/${model}:${tag}`;
    return isSafeOllamaModelId(resolved) ? resolved : null;
}
function walkManifestFiles(root, directory = root, depth = 0, files = []) {
    if (depth > MAX_OLLAMA_MANIFEST_DEPTH || files.length >= MAX_OLLAMA_MODELS) {
        return files;
    }
    let entries;
    try {
        entries = readdirSync(directory, { withFileTypes: true });
    }
    catch {
        return files;
    }
    for (const entry of entries) {
        if (files.length >= MAX_OLLAMA_MODELS)
            break;
        if (entry.isSymbolicLink())
            continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            walkManifestFiles(root, path, depth + 1, files);
        }
        else if (entry.isFile()) {
            const candidate = relative(root, path);
            if (candidate && !candidate.startsWith(`..${sep}`) && candidate !== "..") {
                files.push(candidate);
            }
        }
    }
    return files;
}
/** Read installed model names without requiring the Ollama daemon to run. */
export function listOllamaManifestModels(modelsRoot = process.env.OLLAMA_MODELS || join(homedir(), ".ollama", "models")) {
    const manifestsRoot = join(modelsRoot, "manifests");
    return [...new Set(walkManifestFiles(manifestsRoot)
            .map(parseOllamaManifestPath)
            .filter((model) => Boolean(model)))].slice(0, MAX_OLLAMA_MODELS).sort((left, right) => left.localeCompare(right));
}
export function isLocalOllamaHost(configuredHost = process.env.OLLAMA_HOST) {
    try {
        const hostname = new URL(getOllamaBaseUrl(configuredHost)).hostname.toLowerCase();
        return hostname === "localhost"
            || hostname === "127.0.0.1"
            || hostname === "[::1]"
            || hostname === "::1"
            || hostname === "0.0.0.0"
            || hostname === "[::]";
    }
    catch {
        return true;
    }
}
export function mergeOllamaModelSources(liveModels, localManifestModels, configuredHost = process.env.OLLAMA_HOST) {
    const candidates = isLocalOllamaHost(configuredHost)
        ? [...liveModels, ...localManifestModels]
        : liveModels;
    return [...new Set(candidates.filter(isSafeOllamaModelId))]
        .slice(0, MAX_OLLAMA_MODELS);
}
export function listInstalledOllamaModels() {
    const cacheKey = `${getOllamaBaseUrl()}\0${process.env.OLLAMA_MODELS || ""}`;
    if (_ollamaModels
        && _ollamaModelsCacheKey === cacheKey
        && Date.now() - _ollamaModelsReadAt < 5000) {
        return [..._ollamaModels];
    }
    let liveModels = [];
    try {
        const out = execFileSync("ollama", ["list"], {
            encoding: "utf-8",
            timeout: 3000,
            stdio: ["ignore", "pipe", "ignore"],
        });
        liveModels = parseOllamaListOutput(out);
    }
    catch { }
    // Local manifests are routable only when the selected Ollama endpoint is
    // local. A remote OLLAMA_HOST must never advertise weights that exist solely
    // on this Mac and would fail when sent to the remote daemon.
    _ollamaModels = mergeOllamaModelSources(liveModels, isLocalOllamaHost() ? listOllamaManifestModels() : []);
    _ollamaModelsCacheKey = cacheKey;
    _ollamaModelsReadAt = Date.now();
    return [..._ollamaModels];
}
export function refreshInstalledOllamaModels() {
    _ollamaModels = null;
    _ollamaModelsReadAt = 0;
    _ollamaModelsCacheKey = "";
    return listInstalledOllamaModels();
}
function isInstalledOllamaModel(model) {
    const normalized = model.toLowerCase();
    return listInstalledOllamaModels().some((installed) => {
        const candidate = installed.toLowerCase();
        return candidate === normalized
            || candidate.replace(/:latest$/, "") === normalized.replace(/:latest$/, "");
    });
}
export function detectProvider(model) {
    const m = model.toLowerCase();
    if (m.startsWith("opencode/"))
        return "opencode";
    if (m.startsWith("free-models/"))
        return "free-models";
    // Claude CLI brain (subscription OAuth) — check BEFORE "claude-" and "/" rules.
    if (m === "claude-cli" || m.startsWith("claude-cli/") || m.startsWith("claude-cli-"))
        return "claude-cli";
    // Codex CLI brain (ChatGPT subscription OAuth) — before the "codex" → openai rule.
    if (m === "codex-cli" || m.startsWith("codex-cli/"))
        return "codex-cli";
    if (m === "hydra-ch-4b" || m.startsWith("hydra-ch"))
        return "hydra-local";
    // Hugging Face-backed Ollama models contain slashes, so installed local
    // models must win before the generic provider/model → OpenRouter rule.
    if (isInstalledOllamaModel(m))
        return "ollama";
    // Provider-prefixed models (check BEFORE generic "/" openrouter check)
    if (m.startsWith("ollama/"))
        return "ollama";
    if (m.startsWith("hf.co/"))
        return "ollama";
    if (m.startsWith("nvidia/"))
        return "nvidia";
    if (m.startsWith("github/"))
        return "github-models";
    if (m.startsWith("groq/"))
        return "groq";
    if (m.includes("/"))
        return "openrouter";
    if (m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4") || m.startsWith("codex") || m.startsWith("chatgpt"))
        return "openai";
    if (m.startsWith("claude-"))
        return "anthropic";
    if (m.startsWith("gemini-"))
        return "google";
    if (m.startsWith("deepseek-coder"))
        return "ollama";
    if (m.startsWith("deepseek-"))
        return "deepseek";
    if (m.startsWith("morningstar"))
        return "ollama";
    if (m.startsWith("llama") || m.startsWith("codellama") || m.startsWith("mistral") || m.startsWith("phi") || m.startsWith("qwen") || m.startsWith("gemma") || m.startsWith("starcoder") || m.startsWith("tinyllama") || m.startsWith("vicuna") || m.startsWith("wizardcoder") || m.startsWith("orca") || m.startsWith("neural") || m.startsWith("nomic"))
        return "ollama";
    if (m.startsWith("mixtral"))
        return "groq";
    // Check if model exists in local Ollama before falling back to OpenAI
    if (isInstalledOllamaModel(m))
        return "ollama";
    return "openai";
}
export function getProviderBaseUrl(provider) {
    switch (provider) {
        case "deepseek": return "https://api.deepseek.com/v1";
        case "openai": return "https://api.openai.com/v1";
        case "anthropic": return "https://api.anthropic.com";
        case "google": return "https://generativelanguage.googleapis.com";
        case "ollama": return getOllamaBaseUrl();
        case "free-models": return getFreeModelsBaseUrl();
        case "groq": return "https://api.groq.com/openai/v1";
        case "openrouter": return "https://openrouter.ai/api/v1";
        case "nvidia": return "https://integrate.api.nvidia.com/v1";
        case "github-models": return "https://models.github.ai/inference";
        case "hydra-local": return "http://127.0.0.1:8100/v1";
        default: return "https://api.openai.com/v1";
    }
}
export function getProviderApiKeyEnv(provider) {
    switch (provider) {
        case "deepseek": return "DEEPSEEK_API_KEY";
        case "openai": return "OPENAI_API_KEY";
        case "anthropic": return "ANTHROPIC_API_KEY";
        case "google": return "GOOGLE_API_KEY";
        case "groq": return "GROQ_API_KEY";
        case "openrouter": return "OPENROUTER_API_KEY";
        case "nvidia": return "NVIDIA_NIM_API_KEY";
        case "free-models": return "FREE_MODELS_API_KEY";
        case "github-models": return "GITHUB_MODELS_TOKEN";
        case "ollama": return "";
        case "claude-cli": return "";
        case "codex-cli": return "";
        case "opencode": return "";
        default: return "OPENAI_API_KEY";
    }
}
export function resolveApiKey(provider, configKey) {
    if (provider === "free-models")
        return getFreeModelsApiKey() || configKey;
    const envVar = getProviderApiKeyEnv(provider);
    if (provider === "ollama")
        return "ollama";
    if (provider === "hydra-local")
        return "local";
    // Ignore "ollama" placeholder when switching to cloud providers
    const key = configKey === "ollama" ? "" : configKey;
    return key || (envVar ? process.env[envVar] || "" : "");
}
// Map CLI display model names → actual Ollama model names
const OLLAMA_MODEL_MAP = {
    "morningstar-14b": "morningstar",
    "morningstar-7b": "morningstar",
    "morningstar-32b": "morningstar-32b",
    "morningstar-vision": "morningstar-vision",
};
export function resolveModelName(model, provider) {
    if (provider === "free-models" && model.toLowerCase().startsWith("free-models/"))
        return model.slice("free-models/".length);
    if (provider === "ollama" && model.toLowerCase().startsWith("ollama/"))
        return model.slice("ollama/".length);
    if (provider === "ollama" && OLLAMA_MODEL_MAP[model]) {
        return OLLAMA_MODEL_MAP[model];
    }
    // Strip provider prefix for prefixed models (nvidia/model -> model, github/model -> model)
    if (provider === "nvidia" && model.toLowerCase().startsWith("nvidia/")) {
        return model.slice("nvidia/".length);
    }
    if (provider === "github-models" && model.toLowerCase().startsWith("github/")) {
        return model.slice("github/".length);
    }
    if (provider === "groq" && model.toLowerCase().startsWith("groq/")) {
        return model.slice("groq/".length);
    }
    // claude-cli: "claude-cli" -> "" (Claude CLI default model); "claude-cli/opus" -> "opus".
    // codex-cli behaves identically: "codex-cli/gpt-5.2" -> "gpt-5.2".
    if (provider === "claude-cli" || provider === "codex-cli") {
        const slash = model.indexOf("/");
        return slash >= 0 ? model.slice(slash + 1) : "";
    }
    return model;
}
/** The `claude` CLI's own short aliases, which always track its defaults. */
const CLAUDE_CLI_ALIASES = ["claude-cli", "claude-cli/opus", "claude-cli/sonnet", "claude-cli/haiku"];
/**
 * Models offered for the Claude subscription: the CLI aliases first, then the
 * full Anthropic catalog. `claude -p --model claude-fable-5` is accepted, so the
 * subscription is not limited to the three aliases — listing only those made
 * `/model` look like it had failed to load anything.
 */
export function buildClaudeCliModels(anthropicModels) {
    const prefixed = anthropicModels
        .filter((model) => !model.startsWith("("))
        .map((model) => `claude-cli/${model}`);
    return [...CLAUDE_CLI_ALIASES, ...prefixed.filter((model) => !CLAUDE_CLI_ALIASES.includes(model))];
}
/**
 * Models offered for the ChatGPT subscription: the CLI default first, then the
 * catalog Codex itself keeps on disk. Without that catalog only the default is
 * listed — better one entry that works than invented ids that fail at runtime.
 */
export function buildCodexCliModels(catalog) {
    return ["codex-cli", ...catalog.map((model) => `codex-cli/${model.slug}`)];
}
export function listProviders() {
    const models = (provider) => getDiscoveredProviderModels(provider) ?? [];
    const localOllama = isLocalOllamaHost(getProviderModelEndpoint("ollama") ?? getOllamaBaseUrl());
    return [
        { name: "opencode", models: models("opencode"), envKey: "(OpenCode CLI · Gratis-Modelle)" },
        { name: "free-models", models: models("free-models"), envKey: "FREE_MODELS_API_KEY", modelMetadata: Object.fromEntries(models("free-models").map(model => [model, { deployment: "hosted", availabilityHint: "Free_Models · externer Anbieter über lokalen Gateway; Verfügbarkeit und Kontingente variieren" }])) },
        ...["deepseek", "openai", "anthropic", "google", "nvidia", "github-models", "groq", "openrouter"].map(name => ({ name, models: models(name), envKey: name === "nvidia" ? "NVIDIA_NIM_API_KEY" : name === "github-models" ? "GITHUB_MODELS_TOKEN" : `${name.toUpperCase()}_API_KEY` })),
        { name: "ollama", models: models("ollama"), envKey: "(laufender Ollama-Server)", modelMetadata: Object.fromEntries(models("ollama").map(model => [model, { deployment: localOllama ? "local" : "hosted", availabilityHint: localOllama ? "Vom lokalen Server gemeldet" : "Vom konfigurierten Ollama-Server gemeldet" }])) },
        { name: "claude-cli", models: [...CLAUDE_CLI_ALIASES], envKey: "(Claude-Abo/OAuth)" },
        { name: "codex-cli", models: buildCodexCliModels(listCodexModels()), envKey: "(ChatGPT-Abo/OAuth)" },
    ];
}
export function getModelDisplayName(model) {
    if (model.toLowerCase().startsWith("free-models/"))
        return model.slice("free-models/".length);
    const names = {
        "hydra-ch-4b": "Hydra (alter manueller Eintrag)",
        "deepseek-reasoner": "DeepSeek R1 (Thinking)",
        "deepseek-chat": "DeepSeek Chat",
        // OpenAI Reasoning
        "o3": "o3 (Reasoning)",
        "o3-mini": "o3 Mini (Reasoning)",
        "o3-pro": "o3 Pro (Reasoning Ultra)",
        "o4-mini": "o4 Mini (Reasoning)",
        "o1": "o1 (Reasoning)",
        "o1-mini": "o1 Mini (Reasoning Legacy)",
        "o1-pro": "o1 Pro",
        // OpenAI GPT-4.1
        "gpt-4.1": "GPT-4.1",
        "gpt-4.1-mini": "GPT-4.1 Mini",
        "gpt-4.1-nano": "GPT-4.1 Nano",
        // OpenAI GPT-4o
        "gpt-4o": "GPT-4o",
        "gpt-4o-mini": "GPT-4o Mini",
        "gpt-4-turbo": "GPT-4 Turbo (Legacy)",
        // OpenAI Specialized
        "codex-mini-latest": "Codex Mini (Code)",
        "gpt-4o-search-preview": "GPT-4o Search",
        "gpt-4o-mini-search-preview": "GPT-4o Mini Search",
        // Anthropic
        "claude-fable-5": "Claude Fable 5 (Mythos-class, godmode)",
        "claude-opus-5": "Claude Opus 5",
        "claude-sonnet-5": "Claude Sonnet 5",
        "claude-opus-4-8": "Claude Opus 4.8",
        "claude-opus-4-7": "Claude Opus 4.7",
        "claude-opus-4-6": "Claude Opus 4.6",
        "claude-sonnet-4-6": "Claude Sonnet 4.6",
        "claude-opus-4-6-20260204": "Claude Opus 4.6",
        "claude-sonnet-4-6-20260514": "Claude Sonnet 4.6",
        "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5",
        "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
        "claude-sonnet-4-20250514": "Claude Sonnet 4",
        "claude-opus-4-20250514": "Claude Opus 4",
        "claude-haiku-3-5-20241022": "Claude Haiku 3.5",
        // Google
        "gemini-2.5-flash": "Gemini 2.5 Flash",
        "gemini-2.5-pro": "Gemini 2.5 Pro",
        "gemini-2.0-flash": "Gemini 2.0 Flash",
        "gemini-2.0-pro": "Gemini 2.0 Pro",
        "gemini-1.5-pro": "Gemini 1.5 Pro",
        // NVIDIA NIM
        "nvidia/moonshotai/kimi-k2.6": "Kimi K2.6 (NVIDIA)",
        "nvidia/deepseek-ai/deepseek-v4-pro": "DeepSeek V4 Pro (NVIDIA)",
        "nvidia/deepseek-ai/deepseek-v4-flash": "DeepSeek V4 Flash (NVIDIA)",
        "nvidia/qwen/qwen3.5-397b-a17b": "Qwen 3.5 397B (NVIDIA)",
        "nvidia/qwen/qwen3.5-122b-a10b": "Qwen 3.5 122B (NVIDIA)",
        "nvidia/qwen/qwen3-next-80b-a3b-instruct": "Qwen3-Next 80B (NVIDIA)",
        "nvidia/nvidia/nemotron-3-ultra-550b-a55b": "Nemotron 3 Ultra 550B (NVIDIA)",
        "nvidia/nvidia/nemotron-3-super-120b-a12b": "Nemotron 3 Super 120B (NVIDIA)",
        "nvidia/nvidia/llama-3.3-nemotron-super-49b-v1.5": "Llama 3.3 Nemotron Super 49B (NVIDIA)",
        "nvidia/nvidia/llama-3.1-nemotron-ultra-253b-v1": "Llama 3.1 Nemotron Ultra 253B (NVIDIA)",
        "nvidia/meta/llama-4-maverick-17b-128e-instruct": "Llama 4 Maverick (NVIDIA)",
        "nvidia/meta/llama-3.3-70b-instruct": "Llama 3.3 70B (NVIDIA)",
        "nvidia/mistralai/mistral-large-3-675b-instruct-2512": "Mistral Large 3 675B (NVIDIA)",
        "nvidia/mistralai/mistral-medium-3.5-128b": "Mistral Medium 3.5 128B (NVIDIA)",
        "nvidia/mistralai/mistral-small-4-119b-2603": "Mistral Small 4 119B (NVIDIA)",
        "nvidia/mistralai/codestral-22b-instruct-v0.1": "Codestral 22B (NVIDIA)",
        "nvidia/openai/gpt-oss-120b": "GPT-OSS 120B (NVIDIA)",
        "nvidia/openai/gpt-oss-20b": "GPT-OSS 20B (NVIDIA)",
        "nvidia/minimaxai/minimax-m3": "MiniMax M3 (NVIDIA)",
        "nvidia/minimaxai/minimax-m2.7": "MiniMax M2.7 (NVIDIA)",
        "nvidia/z-ai/glm-5.1": "GLM 5.1 (NVIDIA)",
        // GitHub Models (free)
        "github/gpt-4.1": "GPT-4.1 (GitHub Free)",
        "github/gpt-4.1-mini": "GPT-4.1 Mini (GitHub Free)",
        "github/gpt-4.1-nano": "GPT-4.1 Nano (GitHub Free)",
        "github/o3-mini": "o3 Mini (GitHub Free)",
        "github/o4-mini": "o4 Mini (GitHub Free)",
        "github/DeepSeek-R1": "DeepSeek R1 (GitHub Free)",
        "github/DeepSeek-V3-0324": "DeepSeek V3 (GitHub Free)",
        "github/Llama-3.3-70B-Instruct": "Llama 3.3 70B (GitHub Free)",
        "github/Llama-4-Scout-17B-16E-Instruct": "Llama 4 Scout (GitHub Free)",
        "github/Llama-4-Maverick-17B-128E-Instruct-FP8": "Llama 4 Maverick (GitHub Free)",
        "github/grok-3": "Grok 3 (GitHub Free)",
        "github/grok-3-mini": "Grok 3 Mini (GitHub Free)",
        "github/Mistral-Large-2411": "Mistral Large (GitHub Free)",
        "github/Mistral-Small-24B-Instruct-2501": "Mistral Small 24B (GitHub Free)",
        "github/Phi-4": "Phi 4 (GitHub Free)",
        "github/Phi-4-mini-instruct": "Phi 4 Mini (GitHub Free)",
        "github/command-r-plus-08-2024": "Command R+ (GitHub Free)",
        "github/Jamba-1.5-Large": "Jamba 1.5 Large (GitHub Free)",
        "github/Jamba-1.5-Mini": "Jamba 1.5 Mini (GitHub Free)",
        "github/Codestral-2501": "Codestral (GitHub Free)",
        // Morningstar Local Models
        "morningstar-14b": "Morningstar 14B (Coding)",
        "morningstar-32b": "Morningstar 32B (Pro)",
        "morningstar-vision": "Morningstar Vision (13B)",
        // Claude CLI (subscription OAuth, no API cost)
        "claude-cli": "Claude Code (CLI · Abo)",
        "claude-cli/opus": "Claude Opus (CLI · Abo)",
        "claude-cli/sonnet": "Claude Sonnet (CLI · Abo)",
        "claude-cli/haiku": "Claude Haiku (CLI · Abo)",
        "codex-cli": "Codex (CLI · ChatGPT-Abo)",
    };
    if (names[model])
        return names[model];
    // Subscription models mirror a hosted catalog, so reuse that label instead of
    // maintaining a second list that would drift with every model release.
    if (model.startsWith("claude-cli/")) {
        return `${getModelDisplayName(model.slice("claude-cli/".length))} · Abo`;
    }
    if (model.startsWith("codex-cli/")) {
        // Codex ships its own display names; prefer them over our generic table.
        return `${getCodexModelDisplayName(model.slice("codex-cli/".length))} · Abo`;
    }
    if (isInstalledOllamaModel(model))
        return `Ollama — ${model}`;
    return model;
}
// ─── OpenAI-Compatible SSE Parser ────────────────────────
// Works for: OpenAI, DeepSeek, Ollama, Groq, OpenRouter
async function* openaiCompatibleStream(baseUrl, apiKey, model, messages, maxTokens, temperature, signal, enableTools, providerName, allowedTools, enableSwarm = true) {
    const body = {
        model,
        messages: serializeOpenAIMessages(messages),
        max_tokens: maxTokens,
        temperature,
        stream: true,
    };
    // Request usage data in stream (OpenAI-compatible)
    body.stream_options = { include_usage: true };
    // Add native function calling tools for supported providers
    if (enableTools && providerName && NATIVE_TOOL_PROVIDERS.has(providerName)) {
        const definitions = getOpenAIToolDefinitions(allowedTools, enableSwarm);
        const tools = providerName === "ollama" ? selectRequestTools(definitions, messages) : definitions;
        if (tools.length)
            body.tools = tools;
    }
    let res;
    try {
        res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal,
            ...(providerName === "free-models" ? { redirect: "manual" } : {}),
        });
    }
    catch (e) {
        // Abort/termination errors are expected when user cancels
        if (signal?.aborted || (e instanceof TypeError && (e.message === "terminated" || e.message === "The operation was aborted"))) {
            return;
        }
        throw e;
    }
    if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`API Fehler ${res.status}: ${err.slice(0, 300)}`);
    }
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error("Kein Stream-Reader verfuegbar.");
    const decoder = new TextDecoder();
    let buffer = "";
    let insideThink = false;
    // Accumulator for streamed tool calls (OpenAI sends them incrementally)
    const toolCallAccumulators = new Map();
    try {
        while (true) {
            if (signal?.aborted)
                break;
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (signal?.aborted)
                    return;
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data: "))
                    continue;
                const data = trimmed.slice(6);
                if (data === "[DONE]")
                    return;
                try {
                    const parsed = JSON.parse(data);
                    // Parse usage data (sent in final chunk with empty choices)
                    if (parsed.usage) {
                        const u = parsed.usage;
                        yield {
                            type: "usage",
                            text: "",
                            usage: {
                                inputTokens: u.prompt_tokens || 0,
                                outputTokens: u.completion_tokens || 0,
                                totalTokens: u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0),
                                reasoningTokens: u.completion_tokens_details?.reasoning_tokens || undefined,
                                cacheHitTokens: u.prompt_tokens_details?.cached_tokens || undefined,
                            },
                        };
                    }
                    const choice = parsed.choices?.[0];
                    if (!choice)
                        continue;
                    const token = choice.delta?.content || "";
                    const reasoning = choice.delta?.reasoning_content || "";
                    if (reasoning)
                        yield { type: "reasoning", text: reasoning };
                    if (token) {
                        // Handle <think>...</think> blocks
                        if (token.includes("<think>")) {
                            insideThink = true;
                            const before = token.split("<think>")[0];
                            if (before.trim())
                                yield { type: "content", text: before };
                            const afterTag = token.split("<think>").slice(1).join("<think>");
                            if (afterTag.includes("</think>")) {
                                const thinkContent = afterTag.split("</think>")[0];
                                if (thinkContent.trim())
                                    yield { type: "reasoning", text: thinkContent };
                                insideThink = false;
                                const after = afterTag.split("</think>").slice(1).join("</think>");
                                if (after.trim())
                                    yield { type: "content", text: after };
                            }
                            else if (afterTag.trim()) {
                                yield { type: "reasoning", text: afterTag };
                            }
                            continue;
                        }
                        if (insideThink) {
                            if (token.includes("</think>")) {
                                const thinkPart = token.split("</think>")[0];
                                if (thinkPart.trim())
                                    yield { type: "reasoning", text: thinkPart };
                                insideThink = false;
                                const after = token.split("</think>").slice(1).join("</think>");
                                if (after.trim())
                                    yield { type: "content", text: after };
                            }
                            else {
                                yield { type: "reasoning", text: token };
                            }
                            continue;
                        }
                        yield { type: "content", text: token };
                    }
                    // ─── Native Tool Calls (streamed incrementally) ───
                    if (choice.delta?.tool_calls) {
                        for (const tc of choice.delta.tool_calls) {
                            const idx = tc.index ?? 0;
                            if (!toolCallAccumulators.has(idx)) {
                                toolCallAccumulators.set(idx, { id: tc.id || "", name: tc.function?.name || "", arguments: tc.function?.arguments || "" });
                            }
                            else {
                                const acc = toolCallAccumulators.get(idx);
                                if (tc.id)
                                    acc.id = tc.id;
                                if (tc.function?.name)
                                    acc.name = tc.function.name;
                                if (tc.function?.arguments)
                                    acc.arguments += tc.function.arguments;
                            }
                        }
                    }
                    // Flush tool calls when finish_reason indicates completion
                    if (choice.finish_reason === "tool_calls" || (choice.finish_reason === "stop" && toolCallAccumulators.size > 0)) {
                        const sorted = [...toolCallAccumulators.entries()].sort(([a], [b]) => a - b);
                        for (const [, tc] of sorted) {
                            yield { type: "tool_call", text: "", toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments } };
                        }
                        toolCallAccumulators.clear();
                    }
                }
                catch {
                    // skip malformed JSON
                }
            }
        }
    }
    finally {
        // Flush any remaining tool calls on stream end
        if (toolCallAccumulators.size > 0) {
            const sorted = [...toolCallAccumulators.entries()].sort(([a], [b]) => a - b);
            for (const [, tc] of sorted) {
                yield { type: "tool_call", text: "", toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments } };
            }
        }
        try {
            await reader.cancel();
        }
        catch { }
    }
}
// ─── Anthropic Provider ──────────────────────────────────
async function* anthropicStream(apiKey, model, messages, maxTokens, temperature, signal, enableTools, allowedTools, enableSwarm = true) {
    // Convert messages: system role handled separately
    const systemMsg = messages.find(m => m.role === "system");
    const chatMsgs = serializeAnthropicMessages(messages);
    const body = {
        model,
        messages: chatMsgs,
        max_tokens: maxTokens,
        stream: true,
    };
    if (systemMsg)
        body.system = systemMsg.content;
    // Only set temperature for non-thinking models
    if (temperature > 0 && !model.includes("opus"))
        body.temperature = temperature;
    // Native function calling
    if (enableTools) {
        const tools = getAnthropicToolDefinitions(allowedTools, enableSwarm);
        if (tools.length)
            body.tools = tools;
    }
    let res;
    try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(body),
            signal,
        });
    }
    catch (e) {
        if (signal?.aborted || (e instanceof TypeError && (e.message === "terminated" || e.message?.includes("aborted")))) {
            return;
        }
        throw e;
    }
    if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Anthropic Fehler ${res.status}: ${err.slice(0, 300)}`);
    }
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error("Kein Stream-Reader verfuegbar.");
    const decoder = new TextDecoder();
    let buffer = "";
    // Tool call accumulation for Anthropic
    let currentToolId = "";
    let currentToolName = "";
    let currentToolArgs = "";
    try {
        while (true) {
            if (signal?.aborted)
                break;
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (signal?.aborted)
                    return;
                const trimmed = line.trim();
                if (!trimmed.startsWith("data: "))
                    continue;
                const data = trimmed.slice(6);
                try {
                    const parsed = JSON.parse(data);
                    // Tool use block starts
                    if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
                        currentToolId = parsed.content_block.id || "";
                        currentToolName = parsed.content_block.name || "";
                        currentToolArgs = "";
                    }
                    if (parsed.type === "content_block_delta") {
                        const delta = parsed.delta;
                        if (delta.type === "thinking_delta" || delta.type === "signature_delta") {
                            if (delta.thinking)
                                yield { type: "reasoning", text: delta.thinking };
                        }
                        else if (delta.type === "text_delta") {
                            if (delta.text)
                                yield { type: "content", text: delta.text };
                        }
                        else if (delta.type === "input_json_delta" && delta.partial_json !== undefined) {
                            currentToolArgs += delta.partial_json;
                        }
                    }
                    // Tool use block ends — yield the accumulated tool call
                    if (parsed.type === "content_block_stop" && currentToolName) {
                        yield { type: "tool_call", text: "", toolCall: { id: currentToolId, name: currentToolName, arguments: currentToolArgs } };
                        currentToolId = "";
                        currentToolName = "";
                        currentToolArgs = "";
                    }
                    // Anthropic sends usage in message_delta event
                    if (parsed.type === "message_delta" && parsed.usage) {
                        const u = parsed.usage;
                        yield {
                            type: "usage",
                            text: "",
                            usage: {
                                inputTokens: u.input_tokens || 0,
                                outputTokens: u.output_tokens || 0,
                                totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0),
                            },
                        };
                    }
                    // Anthropic also sends usage in message_start
                    if (parsed.type === "message_start" && parsed.message?.usage) {
                        const u = parsed.message.usage;
                        yield {
                            type: "usage",
                            text: "",
                            usage: {
                                inputTokens: u.input_tokens || 0,
                                outputTokens: u.output_tokens || 0,
                                totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0),
                                cacheHitTokens: u.cache_read_input_tokens || undefined,
                            },
                        };
                    }
                    if (parsed.type === "message_stop")
                        return;
                }
                catch {
                    // skip
                }
            }
        }
    }
    finally {
        try {
            await reader.cancel();
        }
        catch { }
    }
}
// ─── Google Gemini Provider ──────────────────────────────
async function* googleStream(apiKey, model, messages, maxTokens, temperature, signal, enableTools, allowedTools, enableSwarm = true) {
    // Convert messages to Gemini format
    const systemMsg = messages.find(m => m.role === "system");
    const contents = serializeGeminiMessages(messages);
    const body = {
        contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature },
        // Loosen Gemini safety filters as far as the API permits.
        // Hard-stops (e.g. CSAM) remain enforced server-side regardless.
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
        ],
    };
    if (systemMsg) {
        body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }
    // Native function calling
    if (enableTools) {
        const tools = getGoogleToolDefinitions(allowedTools, enableSwarm);
        if (tools[0].functionDeclarations.length)
            body.tools = tools;
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
    let res;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
            },
            redirect: "manual",
            body: JSON.stringify(body),
            signal,
        });
    }
    catch (e) {
        if (signal?.aborted || (e instanceof TypeError && (e.message === "terminated" || e.message?.includes("aborted")))) {
            return;
        }
        throw e;
    }
    if (res.status >= 300 && res.status < 400) {
        throw new Error(`Gemini redirect blocked (${res.status}).`);
    }
    if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Gemini Fehler ${res.status}: ${err.slice(0, 300)}`);
    }
    const reader = res.body?.getReader();
    if (!reader)
        throw new Error("Kein Stream-Reader verfuegbar.");
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            if (signal?.aborted)
                break;
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (signal?.aborted)
                    return;
                const trimmed = line.trim();
                if (!trimmed.startsWith("data: "))
                    continue;
                const data = trimmed.slice(6);
                try {
                    const parsed = JSON.parse(data);
                    const parts = parsed.candidates?.[0]?.content?.parts;
                    if (parts) {
                        for (const part of parts) {
                            // Function call from Gemini
                            if (part.functionCall) {
                                yield {
                                    type: "tool_call",
                                    text: "",
                                    toolCall: {
                                        id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                        name: part.functionCall.name,
                                        arguments: JSON.stringify(part.functionCall.args || {}),
                                    },
                                };
                            }
                            else if (part.text) {
                                yield { type: "content", text: part.text };
                            }
                        }
                    }
                    // Gemini sends usageMetadata in response chunks
                    if (parsed.usageMetadata) {
                        const u = parsed.usageMetadata;
                        yield {
                            type: "usage",
                            text: "",
                            usage: {
                                inputTokens: u.promptTokenCount || 0,
                                outputTokens: u.candidatesTokenCount || 0,
                                totalTokens: u.totalTokenCount || 0,
                                reasoningTokens: u.thoughtsTokenCount || undefined,
                            },
                        };
                    }
                }
                catch {
                    // skip
                }
            }
        }
    }
    finally {
        try {
            await reader.cancel();
        }
        catch { }
    }
}
// ─── Provider Factory ────────────────────────────────────
function createOpenAICompatible(name, defaultBaseUrl) {
    return {
        name,
        supportsTools: NATIVE_TOOL_PROVIDERS.has(name),
        async *streamChat(messages, config, signal, enableTools) {
            // Lokale Provider immer an ihre eigene Adresse: sonst schickt eine auf die
            // Cloud gesetzte config.baseUrl die Anfrage am lokalen Server vorbei.
            const LOKAL = new Set(["hydra-local", "ollama", "free-models"]);
            const runtimeDefaultBaseUrl = name === "ollama"
                ? getOllamaBaseUrl()
                : name === "free-models" ? getFreeModelsBaseUrl() : defaultBaseUrl;
            const baseUrl = LOKAL.has(name)
                ? runtimeDefaultBaseUrl
                : (config.baseUrl !== "https://api.deepseek.com/v1" ? config.baseUrl : runtimeDefaultBaseUrl);
            const apiKey = resolveApiKey(name, config.apiKey);
            const actualModel = resolveModelName(config.model, name);
            if (name === "free-models" && (!actualModel.includes("/") || actualModel.startsWith("combo:"))) {
                throw new Error("Use the OpenCode provider for OpenCode free-tier models. Gateway routing combos are not exposed.");
            }
            yield* openaiCompatibleStream(baseUrl, apiKey, actualModel, messages, config.maxTokens, config.temperature, signal, enableTools, name, config.toolAllowlist, config.enableSwarm !== false);
        },
    };
}
const PROVIDERS = {
    opencode: { name: "opencode", supportsTools: false, async *streamChat(messages, config, signal) { yield* openCodeCliStream(config.model, messages, signal); } },
    deepseek: createOpenAICompatible("deepseek", "https://api.deepseek.com/v1"),
    openai: createOpenAICompatible("openai", "https://api.openai.com/v1"),
    ollama: createOpenAICompatible("ollama", getOllamaBaseUrl()),
    "free-models": createOpenAICompatible("free-models", "http://127.0.0.1:18900/v1"),
    // Eigenes CH-Fachmodell, lokal via scripts/hydra_mlx_server.py aus MORNINGSTAR-AI-MODEL
    "hydra-local": createOpenAICompatible("hydra-local", "http://127.0.0.1:8100/v1"),
    groq: createOpenAICompatible("groq", "https://api.groq.com/openai/v1"),
    openrouter: createOpenAICompatible("openrouter", "https://openrouter.ai/api/v1"),
    nvidia: createOpenAICompatible("nvidia", "https://integrate.api.nvidia.com/v1"),
    "github-models": createOpenAICompatible("github-models", "https://models.github.ai/inference"),
    anthropic: {
        name: "anthropic",
        supportsTools: true,
        async *streamChat(messages, config, signal, enableTools) {
            const apiKey = resolveApiKey("anthropic", config.apiKey);
            yield* anthropicStream(apiKey, config.model, messages, config.maxTokens, config.temperature, signal, enableTools, config.toolAllowlist, config.enableSwarm !== false);
        },
    },
    google: {
        name: "google",
        supportsTools: true,
        async *streamChat(messages, config, signal, enableTools) {
            const apiKey = resolveApiKey("google", config.apiKey);
            yield* googleStream(apiKey, config.model, messages, config.maxTokens, config.temperature, signal, enableTools, config.toolAllowlist, config.enableSwarm !== false);
        },
    },
    // Local `claude` CLI (Claude Code, subscription OAuth) as a pure text brain.
    // supportsTools:false → Carry drives its own <tool:...> protocol loop.
    "claude-cli": {
        name: "claude-cli",
        supportsTools: false,
        async *streamChat(messages, config, signal) {
            const modelAlias = resolveModelName(config.model, "claude-cli");
            yield* claudeCliStream(modelAlias || undefined, messages, signal);
        },
    },
    // Local `codex` CLI (OpenAI Codex, ChatGPT subscription OAuth) as a pure
    // text brain, same contract as claude-cli above.
    "codex-cli": {
        name: "codex-cli",
        supportsTools: false,
        async *streamChat(messages, config, signal) {
            const modelAlias = resolveModelName(config.model, "codex-cli");
            yield* codexCliStream(modelAlias || undefined, messages, signal);
        },
    },
};
export function getProvider(config) {
    const providerName = config.provider || detectProvider(config.model);
    const provider = PROVIDERS[providerName];
    if (!provider) {
        throw new Error(`Unknown provider "${providerName}" for model "${config.model}". `
            + "Choose a listed provider or select the model again.");
    }
    return provider;
}
//# sourceMappingURL=providers.js.map