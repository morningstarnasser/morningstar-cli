import type { Message, CLIConfig } from "./types.js";

export async function* streamChat(
  messages: Message[],
  config: CLIConfig,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`API Fehler ${res.status}: ${err.slice(0, 200)}`);
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

          // DeepSeek R1 uses reasoning_content for thinking, content for output
          const token = choice.delta?.content || "";
          const reasoning = choice.delta?.reasoning_content || "";

          // Skip reasoning tokens (internal thinking)
          if (reasoning && !token) continue;

          if (token) {
            // Filter out <think>...</think> blocks
            if (token.includes("<think>")) insideThink = true;
            if (insideThink) {
              if (token.includes("</think>")) {
                insideThink = false;
                const after = token.split("</think>").pop() || "";
                if (after.trim()) yield after;
              }
              continue;
            }
            yield token;
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

export async function chat(
  messages: Message[],
  config: CLIConfig
): Promise<string> {
  let full = "";
  for await (const token of streamChat(messages, config)) {
    full += token;
  }
  return full;
}
