import type { Message, CLIConfig } from "./types.js";
export interface StreamToken {
    type: "reasoning" | "content";
    text: string;
}
export declare function streamChat(messages: Message[], config: CLIConfig, signal?: AbortSignal): AsyncGenerator<StreamToken>;
export declare function chat(messages: Message[], config: CLIConfig): Promise<string>;
//# sourceMappingURL=ai.d.ts.map