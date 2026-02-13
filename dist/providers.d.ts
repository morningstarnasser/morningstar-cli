import type { Message, CLIConfig } from "./types.js";
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
export declare function detectProvider(model: string): string;
export declare function getProviderBaseUrl(provider: string): string;
export declare function getProviderApiKeyEnv(provider: string): string;
export declare function resolveApiKey(provider: string, configKey: string): string;
export declare function resolveModelName(model: string, provider: string): string;
export declare function listProviders(): {
    name: string;
    models: string[];
    envKey: string;
}[];
export declare function getModelDisplayName(model: string): string;
export declare function getProvider(config: CLIConfig): LLMProvider;
//# sourceMappingURL=providers.d.ts.map