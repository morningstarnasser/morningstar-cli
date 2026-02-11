import type { Message, CLIConfig } from "./types.js";
export interface StreamToken {
    type: "reasoning" | "content";
    text: string;
}
export interface LLMProvider {
    name: string;
    streamChat(messages: Message[], config: CLIConfig, signal?: AbortSignal): AsyncGenerator<StreamToken>;
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