export interface ProviderModelRefreshResult {
    provider: string;
    status: "updated" | "cached" | "skipped" | "failed";
    modelCount: number;
    error?: string;
}
export interface ProviderModelRefreshOptions {
    force?: boolean;
    fetchFn?: typeof fetch;
    now?: () => number;
    /** Trusted configured inference endpoint; never a model- or project-supplied URL. */
    ollamaBaseUrl?: string;
    openCodeModelsFn?: () => Promise<string[]>;
}
export declare function getDiscoveredProviderModels(provider: string): string[] | undefined;
export declare function getProviderModelRefreshStatus(provider: string): ProviderModelRefreshResult["status"] | undefined;
export declare function getProviderModelEndpoint(provider: string): string | undefined;
export declare function ollamaCatalogUrl(baseUrl?: string): string;
export declare function refreshProviderModelCatalogs(resolveCredential: (provider: string) => string, options?: ProviderModelRefreshOptions): Promise<ProviderModelRefreshResult[]>;
/** Test helper; production refreshes naturally through the TTL. */
export declare function clearDiscoveredProviderModels(): void;
//# sourceMappingURL=provider-model-discovery.d.ts.map