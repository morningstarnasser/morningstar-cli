// ─── Model picker menu for the Telegram gateway ──────────────────────────────
// A curated shortlist of strong models across providers, rendered as an inline
// keyboard. Callback data is index-based ("m:<i>") so it stays well under
// Telegram's 64-byte limit regardless of how long a model id is. The same
// ordered MODEL_MENU array is used to build the keyboard and to resolve a tapped
// index back to a model — keep it stable.
import { detectProvider, getModelDisplayName, listProviders } from "../providers.js";
function catalogModels(provider) {
    const models = listProviders().find((item) => item.name === provider)?.models ?? [];
    return models.map((model) => ({ model, provider }));
}
/** Curated, stable-ordered picker. Index position is the callback contract. */
export const MODEL_MENU = [
    // Claude via the local `claude` CLI (subscription OAuth — no API key, no token cost).
    { model: "claude-cli", provider: "claude-cli" },
    { model: "claude-cli/opus", provider: "claude-cli" },
    { model: "claude-cli/sonnet", provider: "claude-cli" },
    { model: "claude-cli/haiku", provider: "claude-cli" },
    // Read the local Ollama manifests through the shared provider catalog.
    ...catalogModels("ollama").filter(({ model }) => !model.startsWith("(")),
    { model: "claude-fable-5", provider: "anthropic" },
    { model: "claude-opus-4-8", provider: "anthropic" },
    { model: "deepseek-chat", provider: "deepseek" },
    { model: "deepseek-reasoner", provider: "deepseek" },
    { model: "gemini-2.5-pro", provider: "google" },
    { model: "gemini-2.5-flash", provider: "google" },
    // NVIDIA NIM — curated live catalog, strong chat/code/reasoning models.
    // Keep provider prefix (nvidia/...) so detectProvider() routes correctly;
    // providers.ts strips the first prefix before calling NVIDIA.
    { model: "nvidia/moonshotai/kimi-k2.6", provider: "nvidia" },
    { model: "nvidia/nvidia/nemotron-3-ultra-550b-a55b", provider: "nvidia" },
    { model: "nvidia/nvidia/nemotron-3-super-120b-a12b", provider: "nvidia" },
    { model: "nvidia/deepseek-ai/deepseek-v4-pro", provider: "nvidia" },
    { model: "nvidia/deepseek-ai/deepseek-v4-flash", provider: "nvidia" },
    { model: "nvidia/qwen/qwen3.5-397b-a17b", provider: "nvidia" },
    { model: "nvidia/qwen/qwen3.5-122b-a10b", provider: "nvidia" },
    { model: "nvidia/qwen/qwen3-next-80b-a3b-instruct", provider: "nvidia" },
    { model: "nvidia/meta/llama-4-maverick-17b-128e-instruct", provider: "nvidia" },
    { model: "nvidia/meta/llama-3.3-70b-instruct", provider: "nvidia" },
    { model: "nvidia/mistralai/mistral-large-3-675b-instruct-2512", provider: "nvidia" },
    { model: "nvidia/mistralai/mistral-medium-3.5-128b", provider: "nvidia" },
    { model: "nvidia/mistralai/mistral-small-4-119b-2603", provider: "nvidia" },
    { model: "nvidia/openai/gpt-oss-120b", provider: "nvidia" },
    { model: "nvidia/openai/gpt-oss-20b", provider: "nvidia" },
    { model: "github/gpt-4.1", provider: "github-models" },
    { model: "github/DeepSeek-V3-0324", provider: "github-models" },
    { model: "gpt-4.1", provider: "openai" },
    { model: "o3", provider: "openai" },
    { model: "groq/llama-3.3-70b-versatile", provider: "groq" },
];
/** Provider display metadata for grouping + emojis. */
const PROVIDER_META = {
    "claude-cli": { emoji: "🔶", label: "Claude CLI (Abo)" },
    ollama: { emoji: "🦙", label: "Ollama Local" },
    anthropic: { emoji: "🧠", label: "Anthropic" },
    deepseek: { emoji: "🐋", label: "DeepSeek" },
    google: { emoji: "✨", label: "Gemini" },
    nvidia: { emoji: "🟢", label: "NVIDIA" },
    "github-models": { emoji: "🐙", label: "GitHub" },
    openai: { emoji: "🤖", label: "OpenAI" },
    groq: { emoji: "⚡", label: "Groq" },
};
function meta(provider) {
    return PROVIDER_META[provider] ?? { emoji: "•", label: provider };
}
/** Clean display names for ids that getModelDisplayName doesn't cover. */
const PRETTY = {
    "nvidia/moonshotai/kimi-k2.6": "Kimi K2.6",
    "nvidia/nvidia/nemotron-3-ultra-550b-a55b": "Nemotron 3 Ultra 550B",
    "nvidia/nvidia/nemotron-3-super-120b-a12b": "Nemotron 3 Super 120B",
    "nvidia/deepseek-ai/deepseek-v4-pro": "DeepSeek V4 Pro",
    "nvidia/deepseek-ai/deepseek-v4-flash": "DeepSeek V4 Flash",
    "nvidia/qwen/qwen3.5-397b-a17b": "Qwen 3.5 397B",
    "nvidia/qwen/qwen3.5-122b-a10b": "Qwen 3.5 122B",
    "nvidia/qwen/qwen3-next-80b-a3b-instruct": "Qwen3-Next 80B",
    "nvidia/meta/llama-4-maverick-17b-128e-instruct": "Llama 4 Maverick",
    "nvidia/meta/llama-3.3-70b-instruct": "Llama 3.3 70B",
    "nvidia/mistralai/mistral-large-3-675b-instruct-2512": "Mistral Large 3 675B",
    "nvidia/mistralai/mistral-medium-3.5-128b": "Mistral Medium 3.5 128B",
    "nvidia/mistralai/mistral-small-4-119b-2603": "Mistral Small 4 119B",
    "nvidia/openai/gpt-oss-120b": "GPT-OSS 120B",
    "nvidia/openai/gpt-oss-20b": "GPT-OSS 20B",
    "groq/llama-3.3-70b-versatile": "Llama 3.3 70B",
    "github/DeepSeek-V3-0324": "DeepSeek V3",
};
/** Short model name without the parenthetical/provider noise. */
function shortName(item) {
    if (PRETTY[item.model])
        return PRETTY[item.model];
    const base = getModelDisplayName(item.model) || item.model;
    const cleaned = base.replace(/\s*\(.*\)$/, "");
    // Fall back to the last path segment for un-named slash ids.
    return cleaned.includes("/") ? cleaned.split("/").pop() : cleaned;
}
/** Compact, mobile-friendly button label. Current model is prefixed with ● for tests + clarity. */
function labelFor(item, hasKey, isCurrent) {
    const { emoji } = meta(item.provider);
    const mark = hasKey ? "✅" : "🔑";
    return `${isCurrent ? "● " : ""}${emoji} ${shortName(item)} ${mark}`;
}
/**
 * Build the inline keyboard (2 columns). `hasKeyFn` decides the ✅/🔑 marker;
 * `current` highlights the active model. Pure + testable.
 */
export function buildModelKeyboard(hasKeyFn, current) {
    const buttons = MODEL_MENU.map((item, i) => ({
        text: labelFor(item, hasKeyFn(item.provider), item.model === current),
        callback_data: `m:${i}`,
    }));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2)
        rows.push(buttons.slice(i, i + 2));
    rows.push([{ text: "↩︎ Schliessen", callback_data: "m:close" }]);
    return rows;
}
/** Resolve a callback_data string ("m:<i>") back to a model id, or null. */
export function modelFromCallback(data) {
    const m = data.match(/^m:(\d+)$/);
    if (!m)
        return null;
    const idx = Number(m[1]);
    return MODEL_MENU[idx]?.model ?? null;
}
/**
 * A readable, provider-grouped catalog shown above the keyboard. If `hasKeyFn`
 * is given, each model gets a ✅/🔑 marker; the current model gets ●.
 */
export function modelMenuText(current, hasKeyFn) {
    const header = current
        ? `🤖 *Modell wählen* — Aktuell: *${getModelDisplayName(current) || current}*`
        : "🤖 *Modell wählen*";
    const groups = new Map();
    for (const item of MODEL_MENU) {
        const list = groups.get(item.provider) ?? [];
        list.push(item);
        groups.set(item.provider, list);
    }
    const sections = [];
    for (const [provider, items] of groups) {
        const { emoji, label } = meta(provider);
        const lines = items.map((item) => {
            const dot = item.model === current ? "● " : "";
            const mark = hasKeyFn ? (hasKeyFn(provider) ? " ✅" : " 🔑") : "";
            return `   ${dot}${shortName(item)}${mark}`;
        });
        sections.push(`${emoji} *${label}*\n${lines.join("\n")}`);
    }
    const legend = hasKeyFn ? "\n\n✅ Key vorhanden · 🔑 Key fehlt · ● aktiv" : "";
    return `${header}\n\n${sections.join("\n\n")}${legend}\n\nTipp einen Button — oder /model <id> für ein beliebiges Modell.`;
}
/** Validate that a provider matches a model — used to warn on manual /model. */
export function providerOf(model) {
    return detectProvider(model);
}
//# sourceMappingURL=models-menu.js.map