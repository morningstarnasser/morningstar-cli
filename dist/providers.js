import { execSync } from "child_process";
import { TOOL_DEFINITIONS, ANTHROPIC_TOOL_DEFINITIONS, GOOGLE_TOOL_DEFINITIONS } from "./tool-definitions.js";
// Providers that support native function calling
const NATIVE_TOOL_PROVIDERS = new Set(["openai", "anthropic", "google", "groq", "openrouter", "nvidia", "github-models"]);
// ─── Provider Detection ──────────────────────────────────
// Cache for Ollama model names (avoid repeated shell calls)
let _ollamaModels = null;
function getOllamaModelNames() {
    if (_ollamaModels)
        return _ollamaModels;
    try {
        const out = execSync("ollama list 2>/dev/null", { encoding: "utf-8", timeout: 3000 });
        _ollamaModels = new Set(out.split("\n").slice(1).map(l => l.split(/\s+/)[0]?.replace(/:latest$/, "")).filter(Boolean));
    }
    catch {
        _ollamaModels = new Set();
    }
    return _ollamaModels;
}
export function detectProvider(model) {
    const m = model.toLowerCase();
    // Provider-prefixed models (check BEFORE generic "/" openrouter check)
    if (m.startsWith("nvidia/"))
        return "nvidia";
    if (m.startsWith("github/"))
        return "github-models";
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
    if (m.startsWith("mixtral") || m.startsWith("groq/"))
        return "groq";
    // Check if model exists in local Ollama before falling back to OpenAI
    const ollamaModels = getOllamaModelNames();
    if (ollamaModels.has(m) || ollamaModels.has(m.replace(/:.*$/, "")))
        return "ollama";
    return "openai";
}
export function getProviderBaseUrl(provider) {
    switch (provider) {
        case "deepseek": return "https://api.deepseek.com/v1";
        case "openai": return "https://api.openai.com/v1";
        case "anthropic": return "https://api.anthropic.com";
        case "google": return "https://generativelanguage.googleapis.com";
        case "ollama": return "http://localhost:11434/v1";
        case "groq": return "https://api.groq.com/openai/v1";
        case "openrouter": return "https://openrouter.ai/api/v1";
        case "nvidia": return "https://integrate.api.nvidia.com/v1";
        case "github-models": return "https://models.github.ai/inference";
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
        case "github-models": return "GITHUB_MODELS_TOKEN";
        case "ollama": return "";
        default: return "OPENAI_API_KEY";
    }
}
export function resolveApiKey(provider, configKey) {
    const envVar = getProviderApiKeyEnv(provider);
    if (provider === "ollama")
        return "ollama";
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
    return model;
}
export function listProviders() {
    return [
        { name: "deepseek", models: ["deepseek-reasoner", "deepseek-chat"], envKey: "DEEPSEEK_API_KEY" },
        { name: "openai", models: ["o3", "o3-mini", "o3-pro", "o4-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "codex-mini-latest", "gpt-4o-search-preview"], envKey: "OPENAI_API_KEY" },
        { name: "anthropic", models: ["claude-opus-4-6-20260204", "claude-sonnet-4-6-20260514", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001", "claude-sonnet-4-20250514", "claude-opus-4-20250514"], envKey: "ANTHROPIC_API_KEY" },
        { name: "google", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro"], envKey: "GOOGLE_API_KEY" },
        { name: "nvidia", models: [
                // Kimi K2
                "nvidia/moonshotai/kimi-k2-instruct",
                "nvidia/moonshotai/kimi-k2.5",
                "nvidia/moonshotai/kimi-k2-thinking",
                "nvidia/moonshotai/kimi-k2-instruct-0905",
                // DeepSeek
                "nvidia/deepseek-ai/deepseek-v3.2",
                "nvidia/deepseek-ai/deepseek-v3.1",
                "nvidia/deepseek-ai/deepseek-r1-distill-qwen-32b",
                // Meta Llama
                "nvidia/meta/llama-3.3-70b-instruct",
                "nvidia/meta/llama-3.1-405b-instruct",
                "nvidia/meta/llama-3.1-70b-instruct",
                "nvidia/meta/llama-4-maverick-17b-128e-instruct",
                "nvidia/meta/llama-4-scout-17b-16e-instruct",
                "nvidia/meta/llama-3.2-90b-vision-instruct",
                // Qwen
                "nvidia/qwen/qwen3.5-397b-a17b",
                "nvidia/qwen/qwen3.5-122b-a10b",
                "nvidia/qwen/qwen3-coder-480b-a35b-instruct",
                "nvidia/qwen/qwen3-next-80b-a3b-thinking",
                "nvidia/qwen/qwq-32b",
                "nvidia/qwen/qwen2.5-coder-32b-instruct",
                // Mistral
                "nvidia/mistralai/mistral-large-3-675b-instruct-2512",
                "nvidia/mistralai/mistral-small-4-119b-2603",
                "nvidia/mistralai/devstral-2-123b-instruct-2512",
                "nvidia/mistralai/codestral-22b-instruct-v0.1",
                // NVIDIA Nemotron
                "nvidia/nvidia/llama-3.1-nemotron-ultra-253b-v1",
                "nvidia/nvidia/nemotron-3-super-120b-a12b",
                "nvidia/nvidia/llama-3.3-nemotron-super-49b-v1.5",
                // OpenAI GPT-OSS
                "nvidia/openai/gpt-oss-120b",
                "nvidia/openai/gpt-oss-20b",
                // Others
                "nvidia/minimaxai/minimax-m2.5",
                "nvidia/z-ai/glm5",
                "nvidia/stepfun-ai/step-3.5-flash",
                "nvidia/bytedance/seed-oss-36b-instruct",
                "nvidia/writer/palmyra-creative-122b",
                "nvidia/google/gemma-3-27b-it",
                "nvidia/microsoft/phi-4-mini-instruct",
                "nvidia/ibm/granite-3.3-8b-instruct",
            ], envKey: "NVIDIA_NIM_API_KEY" },
        { name: "github-models", models: [
                "github/gpt-4.1",
                "github/gpt-4.1-mini",
                "github/gpt-4.1-nano",
                "github/o3-mini",
                "github/o4-mini",
                "github/DeepSeek-R1",
                "github/DeepSeek-V3-0324",
                "github/Llama-3.3-70B-Instruct",
                "github/Llama-4-Scout-17B-16E-Instruct",
                "github/Llama-4-Maverick-17B-128E-Instruct-FP8",
                "github/grok-3",
                "github/grok-3-mini",
                "github/Mistral-Large-2411",
                "github/Mistral-Small-24B-Instruct-2501",
                "github/Phi-4",
                "github/Phi-4-mini-instruct",
                "github/command-r-plus-08-2024",
                "github/Jamba-1.5-Large",
                "github/Jamba-1.5-Mini",
                "github/Codestral-2501",
            ], envKey: "GITHUB_MODELS_TOKEN" },
        { name: "ollama", models: ["morningstar-14b", "morningstar-32b", "morningstar-vision", "llama3", "codellama", "mistral", "deepseek-coder", "phi3", "qwen2.5-coder"], envKey: "(lokal)" },
        { name: "groq", models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"], envKey: "GROQ_API_KEY" },
        { name: "openrouter", models: ["(jedes Modell mit provider/model Format)"], envKey: "OPENROUTER_API_KEY" },
    ];
}
export function getModelDisplayName(model) {
    const names = {
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
        "nvidia/moonshotai/kimi-k2-instruct": "Kimi K2 Instruct (NVIDIA)",
        "nvidia/moonshotai/kimi-k2-instruct-0905": "Kimi K2 Instruct 0905 (NVIDIA)",
        "nvidia/moonshotai/kimi-k2.5": "Kimi K2.5 (NVIDIA)",
        "nvidia/moonshotai/kimi-k2-thinking": "Kimi K2 Thinking (NVIDIA)",
        "nvidia/meta/llama-3.3-70b-instruct": "Llama 3.3 70B (NVIDIA)",
        "nvidia/deepseek-ai/deepseek-v3.2": "DeepSeek V3.2 (NVIDIA)",
        "nvidia/minimax/minimax-m2.5": "MiniMax M2.5 (NVIDIA)",
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
    };
    return names[model] || model;
}
// ─── OpenAI-Compatible SSE Parser ────────────────────────
// Works for: OpenAI, DeepSeek, Ollama, Groq, OpenRouter
async function* openaiCompatibleStream(baseUrl, apiKey, model, messages, maxTokens, temperature, signal, enableTools, providerName) {
    const body = { model, messages, max_tokens: maxTokens, temperature, stream: true };
    // Request usage data in stream (OpenAI-compatible)
    body.stream_options = { include_usage: true };
    // Add native function calling tools for supported providers
    if (enableTools && providerName && NATIVE_TOOL_PROVIDERS.has(providerName)) {
        body.tools = TOOL_DEFINITIONS;
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
            reader.cancel();
        }
        catch { }
    }
}
// ─── Anthropic Provider ──────────────────────────────────
async function* anthropicStream(apiKey, model, messages, maxTokens, temperature, signal, enableTools) {
    // Convert messages: system role handled separately
    const systemMsg = messages.find(m => m.role === "system");
    const chatMsgs = messages.filter(m => m.role !== "system").map(m => ({
        role: m.role,
        content: m.content,
    }));
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
    if (enableTools)
        body.tools = ANTHROPIC_TOOL_DEFINITIONS;
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
            reader.cancel();
        }
        catch { }
    }
}
// ─── Google Gemini Provider ──────────────────────────────
async function* googleStream(apiKey, model, messages, maxTokens, temperature, signal, enableTools) {
    // Convert messages to Gemini format
    const systemMsg = messages.find(m => m.role === "system");
    const contents = messages.filter(m => m.role !== "system").map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
    }));
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
    if (enableTools)
        body.tools = GOOGLE_TOOL_DEFINITIONS;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    let res;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
            reader.cancel();
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
            const baseUrl = config.baseUrl !== "https://api.deepseek.com/v1" ? config.baseUrl : defaultBaseUrl;
            const apiKey = resolveApiKey(name, config.apiKey);
            const actualModel = resolveModelName(config.model, name);
            yield* openaiCompatibleStream(baseUrl, apiKey, actualModel, messages, config.maxTokens, config.temperature, signal, enableTools, name);
        },
    };
}
const PROVIDERS = {
    deepseek: createOpenAICompatible("deepseek", "https://api.deepseek.com/v1"),
    openai: createOpenAICompatible("openai", "https://api.openai.com/v1"),
    ollama: createOpenAICompatible("ollama", "http://localhost:11434/v1"),
    groq: createOpenAICompatible("groq", "https://api.groq.com/openai/v1"),
    openrouter: createOpenAICompatible("openrouter", "https://openrouter.ai/api/v1"),
    nvidia: createOpenAICompatible("nvidia", "https://integrate.api.nvidia.com/v1"),
    "github-models": createOpenAICompatible("github-models", "https://models.github.ai/inference"),
    anthropic: {
        name: "anthropic",
        supportsTools: true,
        async *streamChat(messages, config, signal, enableTools) {
            const apiKey = resolveApiKey("anthropic", config.apiKey);
            yield* anthropicStream(apiKey, config.model, messages, config.maxTokens, config.temperature, signal, enableTools);
        },
    },
    google: {
        name: "google",
        supportsTools: true,
        async *streamChat(messages, config, signal, enableTools) {
            const apiKey = resolveApiKey("google", config.apiKey);
            yield* googleStream(apiKey, config.model, messages, config.maxTokens, config.temperature, signal, enableTools);
        },
    },
};
export function getProvider(config) {
    const providerName = config.provider || detectProvider(config.model);
    return PROVIDERS[providerName] || PROVIDERS.openai;
}
//# sourceMappingURL=providers.js.map