import type { Message, CLIConfig } from "./types.js";
export declare function streamChat(messages: Message[], config: CLIConfig, signal?: AbortSignal): AsyncGenerator<string>;
export declare function chat(messages: Message[], config: CLIConfig): Promise<string>;
//# sourceMappingURL=ai.d.ts.map