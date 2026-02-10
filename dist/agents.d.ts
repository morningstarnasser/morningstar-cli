export interface Agent {
    name: string;
    description: string;
    systemPrompt: string;
    color: string;
}
export declare const AGENTS: Record<string, Agent>;
export declare function getAgentPrompt(agentId: string, baseSystemPrompt: string, allAgents?: Record<string, Agent>): string;
export declare function listAgents(allAgents?: Record<string, Agent>, customOnly?: boolean): string;
//# sourceMappingURL=agents.d.ts.map