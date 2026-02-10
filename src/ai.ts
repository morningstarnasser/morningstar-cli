import type { Message, CLIConfig } from "./types.js";

export interface StreamToken {
  type: "reasoning" | "content";
  text: string;
}

export async function* streamChat(
  messages: Message[],
  config: CLIConfig,
  signal?: AbortSignal
): AsyncGenerator<StreamToken> {
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

          // Yield reasoning tokens as plan/thinking
          if (reasoning) {
            yield { type: "reasoning", text: reasoning };
          }

          if (token) {
            // Handle <think>...</think> blocks in content — show as reasoning
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

export async function chat(
  messages: Message[],
  config: CLIConfig
): Promise<string> {
  let full = "";
  for await (const token of streamChat(messages, config)) {
    if (token.type === "content") full += token.text;
  }
  return full;
}
