export type AgentStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export interface AgentBranch {
    agentId: string;
    status: AgentStatus;
    detail: string;
    elapsedMs: number;
}
interface AgentTreeProps {
    title: string;
    branches: AgentBranch[];
    startTime: number;
    done?: boolean;
}
export declare function AgentTree({ title, branches, startTime, done }: AgentTreeProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=AgentTree.d.ts.map