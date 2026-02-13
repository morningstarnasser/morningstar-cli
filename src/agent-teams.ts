// ─── Agent Teams ─────────────────────────────────────────
// Agent team orchestration with roles and sequential execution

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Agent } from "./agents.js";
import { getAllAgents } from "./custom-agents.js";

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

const CONFIG_DIR = join(homedir(), ".morningstar");
const TEAMS_FILE = join(CONFIG_DIR, "teams.json");

function loadTeams(): Record<string, AgentTeam> {
  try {
    if (existsSync(TEAMS_FILE)) {
      return JSON.parse(readFileSync(TEAMS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveTeams(teams: Record<string, AgentTeam>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2), "utf-8");
}

/**
 * Create a new agent team.
 */
export function createTeam(
  id: string,
  name: string,
  description: string,
  members: TeamMember[]
): { success: boolean; error?: string } {
  const teams = loadTeams();
  if (teams[id]) {
    return { success: false, error: `Team "${id}" existiert bereits.` };
  }

  // Validate members
  const allAgents = getAllAgents();
  for (const member of members) {
    if (!allAgents[member.agentId]) {
      return { success: false, error: `Agent "${member.agentId}" nicht gefunden.` };
    }
  }

  teams[id] = {
    id,
    name,
    description,
    members,
    createdAt: new Date().toISOString(),
  };

  saveTeams(teams);
  return { success: true };
}

/**
 * Delete a team.
 */
export function deleteTeam(id: string): boolean {
  const teams = loadTeams();
  if (!teams[id]) return false;
  delete teams[id];
  saveTeams(teams);
  return true;
}

/**
 * Get a team by ID.
 */
export function getTeam(id: string): AgentTeam | null {
  const teams = loadTeams();
  return teams[id] || null;
}

/**
 * List all teams.
 */
export function listTeams(): AgentTeam[] {
  return Object.values(loadTeams());
}

/**
 * Get the execution order for a team (lead first, workers, reviewer last).
 */
export function getTeamExecutionOrder(team: AgentTeam): TeamMember[] {
  const leads = team.members.filter(m => m.role === "lead");
  const workers = team.members.filter(m => m.role === "worker");
  const reviewers = team.members.filter(m => m.role === "reviewer");
  return [...leads, ...workers, ...reviewers];
}

/**
 * Build team prompt addition for the current agent.
 */
export function buildTeamPrompt(team: AgentTeam, currentAgent: string, previousResults: string[]): string {
  const allAgents = getAllAgents();
  const parts: string[] = [
    `\n--- Team: ${team.name} ---`,
    `Du bist Teil eines Agent-Teams. Deine Rolle: ${team.members.find(m => m.agentId === currentAgent)?.role || "worker"}`,
    `Team-Mitglieder:`,
  ];

  for (const member of team.members) {
    const agent = allAgents[member.agentId];
    const isCurrent = member.agentId === currentAgent;
    parts.push(`  ${isCurrent ? "→ " : "  "}${member.agentId} (${member.role}): ${agent?.name || "Unknown"}`);
  }

  if (previousResults.length > 0) {
    parts.push(`\nBisherige Ergebnisse der anderen Agents:`);
    for (const result of previousResults) {
      parts.push(result);
    }
  }

  parts.push(`--- Ende Team ---`);
  return parts.join("\n");
}

/**
 * Format teams list for display.
 */
export function formatTeamsList(teams: AgentTeam[]): string {
  if (teams.length === 0) return "  Keine Teams erstellt.";

  const allAgents = getAllAgents();
  return teams
    .map(t => {
      const members = t.members
        .map(m => `${allAgents[m.agentId]?.name || m.agentId} (${m.role})`)
        .join(", ");
      return `  ${t.id.padEnd(15)} ${t.name}\n    ${t.description}\n    Members: ${members}`;
    })
    .join("\n\n");
}
