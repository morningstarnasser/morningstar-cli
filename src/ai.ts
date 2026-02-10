import type { Message, CLIConfig } from "./types.js";
import { getProvider } from "./providers.js";

export interface StreamToken {
  type: "reasoning" | "content";
  text: string;
}

export async function* streamChat(
  messages: Message[],
  config: CLIConfig,
  signal?: AbortSignal
): AsyncGenerator<StreamToken> {
  const provider = getProvider(config);
  yield* provider.streamChat(messages, config, signal);
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
