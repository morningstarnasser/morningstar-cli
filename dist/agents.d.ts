export interface Agent {
    name: string;
    description: string;
    systemPrompt: string;
    color: string;
    tools?: string[];
    model?: "opus" | "sonnet" | "haiku" | string;
    origin?: "built-in" | "ecc" | "custom" | string;
}
export declare const AGENTS: Record<string, Agent>;
export declare const ALL_AGENTS: Record<string, Agent>;
export declare function getAgentPrompt(agentId: string, baseSystemPrompt: string, allAgents?: Record<string, Agent>): string;
export declare function listAgents(allAgents?: Record<string, Agent>, customOnly?: boolean): string;
//# sourceMappingURL=agents.d.ts.map