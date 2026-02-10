import type { Message, CLIConfig } from "./types.js";

export interface StreamToken {
  type: "reasoning" | "content";
  text: string;
}

export interface LLMProvider {
  name: string;
  streamChat(messages: Message[], config: CLIConfig, signal?: AbortSignal): AsyncGenerator<StreamToken>;
}

// ─── Provider Detection ──────────────────────────────────

export function detectProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("/")) return "openrouter";
  if (m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "openai";
  if (m.startsWith("claude-")) return "anthropic";
  if (m.startsWith("gemini-")) return "google";
  if (m.startsWith("deepseek-coder")) return "ollama";
  if (m.startsWith("deepseek-")) return "deepseek";
  if (m.startsWith("llama") || m.startsWith("codellama") || m.startsWith("mistral") || m.startsWith("phi") || m.startsWith("qwen") || m.startsWith("gemma") || m.startsWith("starcoder") || m.startsWith("tinyllama") || m.startsWith("vicuna") || m.startsWith("wizardcoder") || m.startsWith("orca") || m.startsWith("neural") || m.startsWith("nomic")) return "ollama";
  if (m.startsWith("mixtral") || m.startsWith("groq/")) return "groq";
  return "openai"; // fallback to OpenAI-compatible
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

export function listProviders(): { name: string; models: string[]; envKey: string }[] {
  return [
    { name: "deepseek", models: ["deepseek-reasoner", "deepseek-chat"], envKey: "DEEPSEEK_API_KEY" },
    { name: "openai", models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "o3-mini", "gpt-4-turbo"], envKey: "OPENAI_API_KEY" },
    { name: "anthropic", models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-3-5-20241022"], envKey: "ANTHROPIC_API_KEY" },
    { name: "google", models: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro"], envKey: "GOOGLE_API_KEY" },
    { name: "ollama", models: ["llama3", "codellama", "mistral", "deepseek-coder", "phi3", "qwen2.5-coder"], envKey: "(lokal)" },
    { name: "groq", models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"], envKey: "GROQ_API_KEY" },
    { name: "openrouter", models: ["(jedes Modell mit provider/model Format)"], envKey: "OPENROUTER_API_KEY" },
  ];
}

export function getModelDisplayName(model: string): string {
  const names: Record<string, string> = {
    "deepseek-reasoner": "DeepSeek R1 (Thinking)",
    "deepseek-chat": "DeepSeek Chat",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "o1": "OpenAI o1",
    "o1-mini": "OpenAI o1 Mini",
    "o3-mini": "OpenAI o3 Mini",
    "gpt-4-turbo": "GPT-4 Turbo",
    "claude-sonnet-4-20250514": "Claude Sonnet 4",
    "claude-opus-4-20250514": "Claude Opus 4",
    "claude-haiku-3-5-20241022": "Claude Haiku 3.5",
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    "gemini-2.0-pro": "Gemini 2.0 Pro",
    "gemini-1.5-pro": "Gemini 1.5 Pro",
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
  signal?: AbortSignal
): AsyncGenerator<StreamToken> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: true }),
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
        } catch {
          // skip malformed JSON
        }
      }
    }
  } finally {
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
  signal?: AbortSignal
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
          if (parsed.type === "content_block_delta") {
            const delta = parsed.delta;
            if (delta.type === "thinking_delta" || delta.type === "signature_delta") {
              if (delta.thinking) yield { type: "reasoning", text: delta.thinking };
            } else if (delta.type === "text_delta") {
              if (delta.text) yield { type: "content", text: delta.text };
            }
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
  signal?: AbortSignal
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
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield { type: "content", text };
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
    async *streamChat(messages, config, signal) {
      const baseUrl = config.baseUrl !== "https://api.deepseek.com/v1" ? config.baseUrl : defaultBaseUrl;
      const apiKey = resolveApiKey(name, config.apiKey);
      yield* openaiCompatibleStream(baseUrl, apiKey, config.model, messages, config.maxTokens, config.temperature, signal);
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
    async *streamChat(messages, config, signal) {
      const apiKey = resolveApiKey("anthropic", config.apiKey);
      yield* anthropicStream(apiKey, config.model, messages, config.maxTokens, config.temperature, signal);
    },
  },

  google: {
    name: "google",
    async *streamChat(messages, config, signal) {
      const apiKey = resolveApiKey("google", config.apiKey);
      yield* googleStream(apiKey, config.model, messages, config.maxTokens, config.temperature, signal);
    },
  },
};

export function getProvider(config: CLIConfig): LLMProvider {
  const providerName = config.provider || detectProvider(config.model);
  return PROVIDERS[providerName] || PROVIDERS.openai;
}
