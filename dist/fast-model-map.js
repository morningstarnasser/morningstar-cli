// Fast model mapping: full model → lighter/faster variant
const FAST_MAP = {
    "deepseek-reasoner": "deepseek-chat",
    "deepseek-chat": "deepseek-reasoner",
    "o3": "o3-mini",
    "o3-mini": "o3",
    "gpt-4.1": "gpt-4.1-mini",
    "gpt-4.1-mini": "gpt-4.1",
    "gpt-4o": "gpt-4o-mini",
    "gpt-4o-mini": "gpt-4o",
    "claude-sonnet-4-20250514": "claude-haiku-3-5-20241022",
    "claude-haiku-3-5-20241022": "claude-sonnet-4-20250514",
    "claude-opus-4-20250514": "claude-sonnet-4-20250514",
    "gemini-2.0-pro": "gemini-2.0-flash",
    "gemini-2.0-flash": "gemini-2.0-pro",
    "gemini-2.5-pro": "gemini-2.5-flash",
    "gemini-2.5-flash": "gemini-2.5-pro",
    "llama-3.3-70b-versatile": "llama-3.1-8b-instant",
    "llama-3.1-8b-instant": "llama-3.3-70b-versatile",
};
export function getFastModel(model) {
    return FAST_MAP[model] || model;
}
export function getDefaultModel(model) {
    // Reverse lookup: if current is fast, get the default
    return FAST_MAP[model] || model;
}
// ─── Model Tier Resolution ─────────────────────────────────
// Maps abstract tiers (opus/sonnet/haiku) to actual model IDs per provider.
// Used by sub-agents to run on the model specified by the agent definition.
const TIER_MAP = {
    anthropic: {
        opus: "claude-opus-4-20250514",
        sonnet: "claude-sonnet-4-20250514",
        haiku: "claude-haiku-3-5-20241022",
    },
    openai: {
        opus: "gpt-4.1",
        sonnet: "gpt-4o",
        haiku: "gpt-4o-mini",
    },
    deepseek: {
        opus: "deepseek-reasoner",
        sonnet: "deepseek-chat",
        haiku: "deepseek-chat",
    },
    google: {
        opus: "gemini-2.5-pro",
        sonnet: "gemini-2.0-pro",
        haiku: "gemini-2.5-flash",
    },
    groq: {
        opus: "llama-3.3-70b-versatile",
        sonnet: "llama-3.3-70b-versatile",
        haiku: "llama-3.1-8b-instant",
    },
    openrouter: {
        opus: "anthropic/claude-opus-4-20250514",
        sonnet: "anthropic/claude-sonnet-4-20250514",
        haiku: "anthropic/claude-haiku-3-5-20241022",
    },
    ollama: {
        opus: "qwen2.5-coder:14b",
        sonnet: "qwen2.5-coder:7b",
        haiku: "qwen2.5-coder:3b",
    },
    nvidia: {
        opus: "meta/llama-3.3-70b-instruct",
        sonnet: "meta/llama-3.3-70b-instruct",
        haiku: "meta/llama-3.1-8b-instruct",
    },
    github: {
        opus: "gpt-4.1",
        sonnet: "gpt-4o",
        haiku: "gpt-4o-mini",
    },
};
/**
 * Resolve an abstract model tier ("opus", "sonnet", "haiku") to an actual model ID
 * for the given provider. Returns null if the tier is not recognized or if the input
 * is already a concrete model ID.
 */
export function resolveModelTier(tier, provider) {
    const lowerTier = tier.toLowerCase();
    if (!["opus", "sonnet", "haiku"].includes(lowerTier))
        return null;
    const providerKey = (provider || "anthropic").toLowerCase();
    const providerMap = TIER_MAP[providerKey];
    if (!providerMap)
        return TIER_MAP.anthropic[lowerTier] || null;
    return providerMap[lowerTier] || null;
}
//# sourceMappingURL=fast-model-map.js.map