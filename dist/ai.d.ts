import type { Message, CLIConfig } from "./types.js";
import type { StreamToken, ToolCallData, UsageData } from "./providers.js";
export type { StreamToken, ToolCallData, UsageData };
export declare function streamChat(messages: Message[], config: CLIConfig, signal?: AbortSignal, enableTools?: boolean): AsyncGenerator<StreamToken>;
export declare function chat(messages: Message[], config: CLIConfig): Promise<string>;
//# sourceMappingURL=ai.d.ts.map