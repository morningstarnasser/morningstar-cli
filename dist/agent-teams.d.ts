export type TeamRole = "lead" | "worker" | "reviewer";
export interface TeamMember {
    agentId: string;
    role: TeamRole;
}
export interface AgentTeam {
    id: string;
    name: string;
    description: string;
    members: TeamMember[];
    createdAt: string;
}
export interface TeamTask {
    id: string;
    description: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    assignedTo?: string;
    result?: string;
}
/**
 * Create a new agent team.
 */
export declare function createTeam(id: string, name: string, description: string, members: TeamMember[]): {
    success: boolean;
    error?: string;
};
/**
 * Delete a team.
 */
export declare function deleteTeam(id: string): boolean;
/**
 * Get a team by ID.
 */
export declare function getTeam(id: string): AgentTeam | null;
/**
 * List all teams.
 */
export declare function listTeams(): AgentTeam[];
/**
 * Get the execution order for a team (lead first, workers, reviewer last).
 */
export declare function getTeamExecutionOrder(team: AgentTeam): TeamMember[];
/**
 * Build team prompt addition for the current agent.
 */
export declare function buildTeamPrompt(team: AgentTeam, currentAgent: string, previousResults: string[]): string;
/**
 * Format teams list for display.
 */
export declare function formatTeamsList(teams: AgentTeam[]): string;
//# sourceMappingURL=agent-teams.d.ts.map