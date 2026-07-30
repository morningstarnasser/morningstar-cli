// ─── Prompt Cache ──────────────────────────────────────
// Optimiert Prompts fuer Provider-seitiges Caching:
// - Anthropic: Explizite cache_control Breakpoints
// - OpenAI: Automatisches Prefix-Caching
// - Google: Context-Caching via cacheContent API
// ─── Constants ───────────────────────────────────────────
// Anthropic: Cache-Reads sind 90% guenstiger als Input-Tokens
const ANTHROPIC_CACHE_DISCOUNT = 0.9;
// Durchschnittspreis pro Input-Token (Claude Sonnet 4 ~$3/MTok)
const AVG_TOKEN_PRICE = 0.000003;
const ANTHROPIC_MAX_BREAKPOINTS = 4;
const TYPE_ORDER = ["system", "rules", "skills", "context", "history", "user"];
// ─── State ───────────────────────────────────────────────
let stats = {
    totalHits: 0, totalTokensSaved: 0, estimatedSavings: 0,
    hitRate: 0, totalRequests: 0, byProvider: {},
};
// ─── Provider Cache Config ───────────────────────────────
const CONFIGS = {
    anthropic: {
        supported: true, type: "explicit", maxBreakpoints: ANTHROPIC_MAX_BREAKPOINTS,
        description: "Explizite cache_control Breakpoints. Cache-Reads 90% guenstiger. Stabile Inhalte an den Anfang.",
    },
    openai: {
        supported: true, type: "automatic", maxBreakpoints: 0,
        description: "Automatisches Prefix-Caching. Prompt-Reihenfolge optimieren: stabile Inhalte zuerst.",
    },
    google: {
        supported: true, type: "context", maxBreakpoints: 1,
        description: "Context-Caching via cacheContent API. Ein Cache-Eintrag pro Kontext.",
    },
};
const NO_CACHE = {
    supported: false, type: "none", maxBreakpoints: 0,
    description: "Kein Prompt-Caching fuer diesen Provider.",
};
export function getProviderCacheConfig(provider) {
    return CONFIGS[provider.toLowerCase().trim()] ?? NO_CACHE;
}
// ─── Build Cacheable System Prompt ──────────────────────
export function buildCacheableSystemPrompt(parts) {
    // Stabile Teile zuerst, dann nach Typ-Reihenfolge
    const sorted = [...parts].sort((a, b) => {
        if (a.stable !== b.stable)
            return a.stable ? -1 : 1;
        return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    });
    const stableIndices = sorted.map((p, i) => p.stable ? i : -1).filter(i => i !== -1);
    const breakpointSet = new Set(stableIndices.slice(-ANTHROPIC_MAX_BREAKPOINTS));
    const anthropicBlocks = sorted.map((part, idx) => {
        const block = { type: "text", text: part.content };
        if (breakpointSet.has(idx))
            block.cache_control = { type: "ephemeral" };
        return block;
    });
    return { prompt: sorted.map(p => p.content).join("\n\n"), anthropicBlocks };
}
// ─── Get Cache Breakpoints ──────────────────────────────
export function getCacheBreakpoints(systemPrompt, contextParts) {
    const breakpoints = [];
    let offset = 0;
    if (systemPrompt.length > 0) {
        offset = systemPrompt.length;
        breakpoints.push(offset);
    }
    const maxAdditional = ANTHROPIC_MAX_BREAKPOINTS - breakpoints.length;
    for (const part of contextParts.slice(0, maxAdditional)) {
        offset += part.length;
        breakpoints.push(offset);
    }
    return breakpoints;
}
// ─── Optimize For Caching ───────────────────────────────
export function optimizeForCaching(messages, provider) {
    const config = getProviderCacheConfig(provider);
    if (!config.supported)
        return { messages: [...messages], breakpointCount: 0 };
    const systemMsgs = messages.filter(m => m.role === "system");
    const nonSystem = messages.filter(m => m.role !== "system");
    const optimized = [...systemMsgs, ...nonSystem];
    if (config.type === "explicit" && systemMsgs.length > 0) {
        const systemBlocks = [];
        let count = 0;
        for (const msg of systemMsgs) {
            const block = { type: "text", text: msg.content };
            if (count < ANTHROPIC_MAX_BREAKPOINTS) {
                block.cache_control = { type: "ephemeral" };
                count++;
            }
            systemBlocks.push(block);
        }
        return { messages: optimized, systemBlocks, breakpointCount: count };
    }
    return { messages: optimized, breakpointCount: 0 };
}
// ─── Cache Statistics ────────────────────────────────────
export function trackCacheHit(provider, hitTokens) {
    if (hitTokens <= 0)
        return;
    const p = provider.toLowerCase().trim();
    stats.totalHits++;
    stats.totalTokensSaved += hitTokens;
    stats.estimatedSavings += hitTokens * AVG_TOKEN_PRICE * ANTHROPIC_CACHE_DISCOUNT;
    if (!stats.byProvider[p])
        stats.byProvider[p] = { hits: 0, tokensSaved: 0 };
    stats.byProvider[p].hits++;
    stats.byProvider[p].tokensSaved += hitTokens;
}
export function trackRequest(provider, _hadCacheHit) {
    stats.totalRequests++;
    if (stats.totalRequests > 0)
        stats.hitRate = stats.totalHits / stats.totalRequests;
    const p = provider.toLowerCase().trim();
    if (!stats.byProvider[p])
        stats.byProvider[p] = { hits: 0, tokensSaved: 0 };
}
export function getCacheStats() {
    if (stats.totalRequests > 0)
        stats.hitRate = stats.totalHits / stats.totalRequests;
    return { ...stats, byProvider: Object.fromEntries(Object.entries(stats.byProvider).map(([k, v]) => [k, { ...v }])) };
}
export function resetCacheStats() {
    stats = { totalHits: 0, totalTokensSaved: 0, estimatedSavings: 0, hitRate: 0, totalRequests: 0, byProvider: {} };
}
export function formatCacheStats() {
    const s = getCacheStats();
    if (s.totalRequests === 0)
        return "Cache: Keine Daten (noch keine Requests)";
    const lines = [
        "--- Prompt Cache ---",
        `Requests:    ${s.totalRequests}`,
        `Cache-Hits:  ${s.totalHits}`,
        `Hit-Rate:    ${(s.hitRate * 100).toFixed(1)}%`,
        `Tokens:      ${s.totalTokensSaved.toLocaleString()}`,
        `Ersparnis:   $${s.estimatedSavings.toFixed(4)}`,
    ];
    const providers = Object.entries(s.byProvider);
    if (providers.length > 0) {
        lines.push("");
        for (const [p, d] of providers)
            lines.push(`  ${p}: ${d.hits} Hits, ${d.tokensSaved.toLocaleString()} Tokens`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=prompt-cache.js.map