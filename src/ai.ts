import type { Message, CLIConfig } from "./types.js";
import { getProvider } from "./providers.js";
import type { StreamToken, ToolCallData, UsageData } from "./providers.js";

export type { StreamToken, ToolCallData, UsageData };

export async function* streamChat(
  messages: Message[],
  config: CLIConfig,
  signal?: AbortSignal,
  enableTools?: boolean,
): AsyncGenerator<StreamToken> {
  const provider = getProvider(config);
  yield* provider.streamChat(messages, config, signal, enableTools);
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
