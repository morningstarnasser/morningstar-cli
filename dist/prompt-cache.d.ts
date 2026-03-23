import type { Message } from "./types.js";
export interface CacheablePart {
    content: string;
    type: "system" | "rules" | "skills" | "context" | "history" | "user";
    stable: boolean;
}
export interface CacheStats {
    totalHits: number;
    totalTokensSaved: number;
    estimatedSavings: number;
    hitRate: number;
    totalRequests: number;
    byProvider: Record<string, {
        hits: number;
        tokensSaved: number;
    }>;
}
export interface ProviderCacheConfig {
    supported: boolean;
    type: "explicit" | "automatic" | "context" | "none";
    maxBreakpoints: number;
    description: string;
}
export interface AnthropicCacheBlock {
    type: "text";
    text: string;
    cache_control?: {
        type: "ephemeral";
    };
}
export interface OptimizedPrompt {
    messages: Message[];
    systemBlocks?: AnthropicCacheBlock[];
    breakpointCount: number;
}
export declare function getProviderCacheConfig(provider: string): ProviderCacheConfig;
export declare function buildCacheableSystemPrompt(parts: CacheablePart[]): {
    prompt: string;
    anthropicBlocks: AnthropicCacheBlock[];
};
export declare function getCacheBreakpoints(systemPrompt: string, contextParts: string[]): number[];
export declare function optimizeForCaching(messages: Message[], provider: string): OptimizedPrompt;
export declare function trackCacheHit(provider: string, hitTokens: number): void;
export declare function trackRequest(provider: string, _hadCacheHit: boolean): void;
export declare function getCacheStats(): CacheStats;
export declare function resetCacheStats(): void;
export declare function formatCacheStats(): string;
//# sourceMappingURL=prompt-cache.d.ts.map