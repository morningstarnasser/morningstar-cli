export interface Agent {
    name: string;
    description: string;
    systemPrompt: string;
    color: string;
}
export declare const AGENTS: Record<string, Agent>;
export declare function getAgentPrompt(agentId: string, baseSystemPrompt: string): string;
export declare function listAgents(): string;
//# sourceMappingURL=agents.d.ts.map