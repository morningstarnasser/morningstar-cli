export declare function getFastModel(model: string): string;
export declare function getDefaultModel(model: string): string;
/**
 * Resolve an abstract model tier ("opus", "sonnet", "haiku") to an actual model ID
 * for the given provider. Returns null if the tier is not recognized or if the input
 * is already a concrete model ID.
 */
export declare function resolveModelTier(tier: string, provider?: string): string | null;
//# sourceMappingURL=fast-model-map.d.ts.map