// Preise pro 1M Tokens (USD)
const PRICING = {
    // DeepSeek
    "deepseek-reasoner": { input: 0.55, output: 2.19 },
    "deepseek-chat": { input: 0.27, output: 1.10 },
    // OpenAI Reasoning
    "o3": { input: 2.00, output: 8.00 },
    "o3-mini": { input: 1.10, output: 4.40 },
    "o3-pro": { input: 20.00, output: 80.00 },
    "o4-mini": { input: 1.10, output: 4.40 },
    "o1": { input: 15.00, output: 60.00 },
    "o1-mini": { input: 1.10, output: 4.40 },
    "o1-pro": { input: 150.00, output: 600.00 },
    // OpenAI GPT-4.1
    "gpt-4.1": { input: 2.00, output: 8.00 },
    "gpt-4.1-mini": { input: 0.40, output: 1.60 },
    "gpt-4.1-nano": { input: 0.10, output: 0.40 },
    // OpenAI GPT-4o
    "gpt-4o": { input: 2.50, output: 10.00 },
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "gpt-4-turbo": { input: 10.00, output: 30.00 },
    // OpenAI Specialized
    "codex-mini-latest": { input: 1.50, output: 6.00 },
    "gpt-4o-search-preview": { input: 2.50, output: 10.00 },
    "gpt-4o-mini-search-preview": { input: 0.15, output: 0.60 },
    // Anthropic
    "claude-sonnet-4-20250514": { input: 3.00, output: 15.00 },
    "claude-opus-4-20250514": { input: 15.00, output: 75.00 },
    "claude-haiku-3-5-20241022": { input: 0.80, output: 4.00 },
    // Google
    "gemini-2.0-flash": { input: 0.10, output: 0.40 },
    "gemini-2.0-pro": { input: 1.25, output: 5.00 },
    "gemini-1.5-pro": { input: 1.25, output: 5.00 },
    // Groq (free tier)
    "llama-3.3-70b-versatile": { input: 0.00, output: 0.00 },
    "mixtral-8x7b-32768": { input: 0.00, output: 0.00 },
    "gemma2-9b-it": { input: 0.00, output: 0.00 },
};
// Session state
let session = { totalInput: 0, totalOutput: 0, totalCost: 0, messages: 0, byModel: {} };
export function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
export function getCostPerMessage(model, inputTokens, outputTokens) {
    const price = PRICING[model] || { input: 1.0, output: 3.0 }; // default estimate
    return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
export function trackUsage(model, inputText, outputText) {
    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);
    const cost = getCostPerMessage(model, inputTokens, outputTokens);
    session.totalInput += inputTokens;
    session.totalOutput += outputTokens;
    session.totalCost += cost;
    session.messages++;
    if (!session.byModel[model])
        session.byModel[model] = { input: 0, output: 0, cost: 0, count: 0 };
    session.byModel[model].input += inputTokens;
    session.byModel[model].output += outputTokens;
    session.byModel[model].cost += cost;
    session.byModel[model].count++;
    return { inputTokens, outputTokens, model, cost, timestamp: new Date().toISOString() };
}
export function getSessionCosts() {
    return { ...session };
}
export function formatCostDisplay() {
    const lines = [];
    lines.push(`  Messages:    ${session.messages}`);
    lines.push(`  Tokens in:   ${session.totalInput.toLocaleString()}`);
    lines.push(`  Tokens out:  ${session.totalOutput.toLocaleString()}`);
    lines.push(`  Kosten:      $${session.totalCost.toFixed(4)}`);
    if (Object.keys(session.byModel).length > 0) {
        lines.push("");
        for (const [model, data] of Object.entries(session.byModel)) {
            lines.push(`  ${model}: ${data.count} msgs, $${data.cost.toFixed(4)}`);
        }
    }
    return lines.join("\n");
}
export function resetSessionCosts() {
    session = { totalInput: 0, totalOutput: 0, totalCost: 0, messages: 0, byModel: {} };
}
export function isFreeTier(model) {
    const price = PRICING[model];
    return !price || (price.input === 0 && price.output === 0);
}
//# sourceMappingURL=cost-tracker.js.map