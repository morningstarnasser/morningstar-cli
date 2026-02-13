import { execSync } from "child_process";
import type { Message, CLIConfig } from "./types.js";
import { TOOL_DEFINITIONS, ANTHROPIC_TOOL_DEFINITIONS, GOOGLE_TOOL_DEFINITIONS } from "./tool-definitions.js";

export interface ToolCallData {
  id: string;
  name: string;
  arguments: string;
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheHitTokens?: number;
}

export interface StreamToken {
  type: "reasoning" | "content" | "tool_call" | "usage";
  text: string;
  toolCall?: ToolCallData;
  usage?: UsageData;
}

export interface LLMProvider {
  name: string;
  supportsTools: boolean;
  streamChat(messages: Message[], config: CLIConfig, signal?: AbortSignal, enableTools?: boolean): AsyncGenerator<StreamToken>;
}

// Providers that support native function calling
const NATIVE_TOOL_PROVIDERS = new Set(["openai", "anthropic", "google", "groq", "openrouter"]);

// ─── Provider Detection ──────────────────────────────────

// Cache for Ollama model names (avoid repeated shell calls)
let _ollamaModels: Set<string> | null = null;
function getOllamaModelNames(): Set<string> {
  if (_ollamaModels) return _ollamaModels;
  try {
    const out = execSync("ollama list 2>/dev/null", { encoding: "utf-8", timeout: 3000 });
    _ollamaModels = new Set(
      out.split("\n").slice(1).map(l => l.split(/\s+/)[0]?.replace(/:latest$/, "")).filter(Boolean)
    );
  } catch { _ollamaModels = new Set(); }
  return _ollamaModels;
}

export function detectProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("/")) return "openrouter";
  if (m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4") || m.startsWith("codex") || m.startsWith("chatgpt")) return "openai";
  if (m.startsWith("claude-")) return "anthropic";
  if (m.startsWith("gemini-")) return "google";
  if (m.startsWith("deepseek-coder")) return "ollama";
  if (m.startsWith("deepseek-")) return "deepseek";
  if (m.startsWith("morningstar")) return "ollama";
  if (m.startsWith("llama") || m.startsWith("codellama") || m.startsWith("mistral") || m.startsWith("phi") || m.startsWith("qwen") || m.startsWith("gemma") || m.startsWith("starcoder") || m.startsWith("tinyllama") || m.startsWith("vicuna") || m.startsWith("wizardcoder") || m.startsWith("orca") || m.startsWith("neural") || m.startsWith("nomic")) return "ollama";
  if (m.startsWith("mixtral") || m.startsWith("groq/")) return "groq";
  // Check if model exists in local Ollama before falling back to OpenAI
  const ollamaModels = getOllamaModelNames();
  if (ollamaModels.has(m) || ollamaModels.has(m.replace(/:.*$/, ""))) return "ollama";
  return "openai";
}

export function getProviderBaseUrl(provider: string): string {
  switch (provider) {
    case "deepseek": return "https://api.deepseek.com/v1";
    case "openai": return "https://api.openai.com/v1";
    case "anthropic": return "https://api.anthropic.com";
    case "google": return "https://generativelanguage.googleapis.com";
    case "ollama": return "http://localhost:11434/v1";
    case "groq": return "https://api.groq.com/openai/v1";
    case "openrouter": return "https://openrouter.ai/api/v1";
    default: return "https://api.openai.com/v1";
  }
}

export function getProviderApiKeyEnv(provider: string): string {
  switch (provider) {
    case "deepseek": return "DEEPSEEK_API_KEY";
    case "openai": return "OPENAI_API_KEY";
    case "anthropic": return "ANTHROPIC_API_KEY";
    case "google": return "GOOGLE_API_KEY";
    case "groq": return "GROQ_API_KEY";
    case "openrouter": return "OPENROUTER_API_KEY";
    case "ollama": return "";
    default: return "OPENAI_API_KEY";
  }
}

export function resolveApiKey(provider: string, configKey: string): string {
  const envVar = getProviderApiKeyEnv(provider);
  if (provider === "ollama") return "ollama";
  // Ignore "ollama" placeholder when switching to cloud providers
  const key = configKey === "ollama" ? "" : configKey;
  return key || (envVar ? process.env[envVar] || "" : "");
}

// Map CLI display model names → actual Ollama model names
const OLLAMA_MODEL_MAP: Record<string, string> = {
  "morningstar-14b": "morningstar",
  "morningstar-7b": "morningstar",
  "morningstar-32b": "morningstar-32b",
  "morningstar-vision": "morningstar-vision",
};

export function resolveModelName(model: string, provider: string): string {
  if (provider === "ollama" && OLLAMA_MODEL_MAP[model]) {
    return OLLAMA_MODEL_MAP[model];
  }
  return model;
}

export function listProviders(): { name: string; models: string[]; envKey: string }[] {
  return [
    { name: "deepseek", models: ["deepseek-reasoner", "deepseek-chat"], envKey: "DEEPSEEK_API_KEY" },
    { name: "openai", models: ["o3", "o3-mini", "o3-pro", "o4-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "codex-mini-latest", "gpt-4o-search-preview"], envKey: "OPENAI_API_KEY" },
    { name: "anthropic", models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-3-5-20241022"], envKey: "ANTHROPIC_API_KEY" },
    { name: "google", models: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro"], envKey: "GOOGLE_API_KEY" },
    { name: "ollama", models: ["morningstar-14b", "morningstar-32b", "morningstar-vision", "llama3", "codellama", "mistral", "deepseek-coder", "phi3", "qwen2.5-coder"], envKey: "(lokal)" },
    { name: "groq", models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"], envKey: "GROQ_API_KEY" },
    { name: "openrouter", models: ["(jedes Modell mit provider/model Format)"], envKey: "OPENROUTER_API_KEY" },
  ];
}

export function getModelDisplayName(model: string): string {
  const names: Record<string, string> = {
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
    "claude-sonnet-4-20250514": "Claude Sonnet 4",
    "claude-opus-4-20250514": "Claude Opus 4",
    "claude-haiku-3-5-20241022": "Claude Haiku 3.5",
    // Google
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    "gemini-2.0-pro": "Gemini 2.0 Pro",
    "gemini-1.5-pro": "Gemini 1.5 Pro",
    // Morningstar Local Models
    "morningstar-14b": "Morningstar 14B (Coding)",
    "morningstar-32b": "Morningstar 32B (Pro)",
    "morningstar-vision": "Morningstar Vision (13B)",
  };
  return names[model] || model;
}

// ─── OpenAI-Compatible SSE Parser ────────────────────────
// Works for: OpenAI, DeepSeek, Ollama, Groq, OpenRouter

async function* openaiCompatibleStream(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Message[],
  maxTokens: number,
  temperature: number,
  signal?: AbortSignal,
  enableTools?: boolean,
  providerName?: string,
): AsyncGenerator<StreamToken> {
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens, temperature, stream: true };

  // Request usage data in stream (OpenAI-compatible)
  body.stream_options = { include_usage: true };

  // Add native function calling tools for supported providers
  if (enableTools && providerName && NATIVE_TOOL_PROVIDERS.has(providerName)) {
    body.tools = TOOL_DEFINITIONS;
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`API Fehler ${res.status}: ${err.slice(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Kein Stream-Reader verfuegbar.");

  const decoder = new TextDecoder();
  let buffer = "";
  let insideThink = false;
  // Accumulator for streamed tool calls (OpenAI sends them incrementally)
  const toolCallAccumulators = new Map<number, { id: string; name: string; arguments: string }>();

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (signal?.aborted) return;
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

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
          if (!choice) continue;

          const token = choice.delta?.content || "";
          const reasoning = choice.delta?.reasoning_content || "";

          if (reasoning) yield { type: "reasoning", text: reasoning };

          if (token) {
            // Handle <think>...</think> blocks
            if (token.includes("<think>")) {
              insideThink = true;
              const before = token.split("<think>")[0];
              if (before.trim()) yield { type: "content", text: before };
              const afterTag = token.split("<think>").slice(1).join("<think>");
              if (afterTag.includes("</think>")) {
                const thinkContent = afterTag.split("</think>")[0];
                if (thinkContent.trim()) yield { type: "reasoning", text: thinkContent };
                insideThink = false;
                const after = afterTag.split("</think>").slice(1).join("</think>");
                if (after.trim()) yield { type: "content", text: after };
              } else if (afterTag.trim()) {
                yield { type: "reasoning", text: afterTag };
              }
              continue;
            }
            if (insideThink) {
              if (token.includes("</think>")) {
                const thinkPart = token.split("</think>")[0];
                if (thinkPart.trim()) yield { type: "reasoning", text: thinkPart };
                insideThink = false;
                const after = token.split("</think>").slice(1).join("</think>");
                if (after.trim()) yield { type: "content", text: after };
              } else {
                yield { type: "reasoning", text: token };
              }
              continue;
            }
            yield { type: "content", text: token };
          }

          // ─── Native Tool Calls (streamed incrementally) ───
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx: number = tc.index ?? 0;
              if (!toolCallAccumulators.has(idx)) {
                toolCallAccumulators.set(idx, { id: tc.id || "", name: tc.function?.name || "", arguments: tc.function?.arguments || "" });
              } else {
                const acc = toolCallAccumulators.get(idx)!;
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) acc.arguments += tc.function.arguments;
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
        } catch {
          // skip malformed JSON
        }
      }
    }
  } finally {
    // Flush any remaining tool calls on stream end
    if (toolCallAccumulators.size > 0) {
      const sorted = [...toolCallAccumulators.entries()].sort(([a], [b]) => a - b);
      for (const [, tc] of sorted) {
        yield { type: "tool_call", text: "", toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments } };
      }
    }
    try { reader.cancel(); } catch {}
  }
}

// ─── Anthropic Provider ──────────────────────────────────

async function* anthropicStream(
  apiKey: string,
  model: string,
  messages: Message[],
  maxTokens: number,
  temperature: number,
  signal?: AbortSignal,
  enableTools?: boolean,
): AsyncGenerator<StreamToken> {
  // Convert messages: system role handled separately
  const systemMsg = messages.find(m => m.role === "system");
  const chatMsgs = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const body: Record<string, unknown> = {
    model,
    messages: chatMsgs,
    max_tokens: maxTokens,
    stream: true,
  };
  if (systemMsg) body.system = systemMsg.content;
  // Only set temperature for non-thinking models
  if (temperature > 0 && !model.includes("opus")) body.temperature = temperature;
  // Native function calling
  if (enableTools) body.tools = ANTHROPIC_TOOL_DEFINITIONS;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Anthropic Fehler ${res.status}: ${err.slice(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Kein Stream-Reader verfuegbar.");

  const decoder = new TextDecoder();
  let buffer = "";
  // Tool call accumulation for Anthropic
  let currentToolId = "";
  let currentToolName = "";
  let currentToolArgs = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (signal?.aborted) return;
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
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
              if (delta.thinking) yield { type: "reasoning", text: delta.thinking };
            } else if (delta.type === "text_delta") {
              if (delta.text) yield { type: "content", text: delta.text };
            } else if (delta.type === "input_json_delta" && delta.partial_json !== undefined) {
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

          if (parsed.type === "message_stop") return;
        } catch {
          // skip
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch {}
  }
}

// ─── Google Gemini Provider ──────────────────────────────

async function* googleStream(
  apiKey: string,
  model: string,
  messages: Message[],
  maxTokens: number,
  temperature: number,
  signal?: AbortSignal,
  enableTools?: boolean,
): AsyncGenerator<StreamToken> {
  // Convert messages to Gemini format
  const systemMsg = messages.find(m => m.role === "system");
  const contents = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }
  // Native function calling
  if (enableTools) body.tools = GOOGLE_TOOL_DEFINITIONS;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Gemini Fehler ${res.status}: ${err.slice(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Kein Stream-Reader verfuegbar.");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (signal?.aborted) return;
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
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
              } else if (part.text) {
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
        } catch {
          // skip
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch {}
  }
}

// ─── Provider Factory ────────────────────────────────────

function createOpenAICompatible(name: string, defaultBaseUrl: string): LLMProvider {
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

const PROVIDERS: Record<string, LLMProvider> = {
  deepseek: createOpenAICompatible("deepseek", "https://api.deepseek.com/v1"),
  openai: createOpenAICompatible("openai", "https://api.openai.com/v1"),
  ollama: createOpenAICompatible("ollama", "http://localhost:11434/v1"),
  groq: createOpenAICompatible("groq", "https://api.groq.com/openai/v1"),
  openrouter: createOpenAICompatible("openrouter", "https://openrouter.ai/api/v1"),

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

export function getProvider(config: CLIConfig): LLMProvider {
  const providerName = config.provider || detectProvider(config.model);
  return PROVIDERS[providerName] || PROVIDERS.openai;
}
