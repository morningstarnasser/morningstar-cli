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
export declare function trackUsage(model: string, inputText: string, outputText: string): TokenUsage;
export declare function getSessionCosts(): SessionCosts;
export declare function formatCostDisplay(): string;
export declare function resetSessionCosts(): void;
export declare function isFreeTier(model: string): boolean;
//# sourceMappingURL=cost-tracker.d.ts.map