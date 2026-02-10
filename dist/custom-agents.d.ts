import type { Agent } from "./agents.js";
export declare function loadCustomAgents(): Record<string, Agent>;
export declare function saveCustomAgents(agents: Record<string, Agent>): void;
export declare function createAgent(id: string, agent: Agent): {
    success: boolean;
    error?: string;
};
export declare function editAgent(id: string, updates: Partial<Agent>): {
    success: boolean;
    error?: string;
};
export declare function deleteAgent(id: string): {
    success: boolean;
    error?: string;
};
export declare function getAllAgents(): Record<string, Agent>;
export declare function isBuiltinAgent(id: string): boolean;
//# sourceMappingURL=custom-agents.d.ts.map