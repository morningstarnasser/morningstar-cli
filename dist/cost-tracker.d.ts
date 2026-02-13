export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    model: string;
    cost: number;
    timestamp: string;
}
export interface SessionCosts {
    totalInput: number;
    totalOutput: number;
    totalCost: number;
    messages: number;
    byModel: Record<string, {
        input: number;
        output: number;
        cost: number;
        count: number;
    }>;
}
export declare function estimateTokens(text: string): number;
export declare function getCostPerMessage(model: string, inputTokens: number, outputTokens: number): number;
/**
 * Track usage with real token counts from API, or estimate from text.
 * If realInput/realOutput are provided (> 0), they are used instead of estimation.
 */
export declare function trackUsage(model: string, inputText: string, outputText: string, realInput?: number, realOutput?: number): TokenUsage;
export declare function getSessionCosts(): SessionCosts;
export declare function formatCostDisplay(): string;
export declare function resetSessionCosts(): void;
export declare function isFreeTier(model: string): boolean;
/**
 * Check if session cost exceeds the budget limit.
 */
export declare function isBudgetExceeded(maxBudgetUsd: number): boolean;
/**
 * Get remaining budget.
 */
export declare function getRemainingBudget(maxBudgetUsd: number): number;
//# sourceMappingURL=cost-tracker.d.ts.map