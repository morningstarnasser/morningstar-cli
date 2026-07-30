// ─── Agent Teams ─────────────────────────────────────────
// Agent team orchestration with roles and sequential execution
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync, } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { getAllAgents } from "./custom-agents.js";
const CONFIG_DIR = join(homedir(), ".morningstar");
const TEAMS_FILE = join(CONFIG_DIR, "teams.json");
const TEAM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
function configuredTeamsFile() {
    const override = process.env.MORNINGSTAR_TEAMS_FILE;
    if (override?.includes("\0")) {
        throw new Error("MORNINGSTAR_TEAMS_FILE enthaelt ein NUL-Zeichen.");
    }
    return {
        file: resolve(override || TEAMS_FILE),
        isDefault: !override,
    };
}
function canonicalTeamsFile(createDirectory) {
    const configured = configuredTeamsFile();
    const requestedDirectory = dirname(configured.file);
    const directoryExisted = existsSync(requestedDirectory);
    if (!directoryExisted && createDirectory) {
        mkdirSync(requestedDirectory, { recursive: true, mode: 0o700 });
    }
    const directory = existsSync(requestedDirectory)
        ? realpathSync(requestedDirectory)
        : requestedDirectory;
    return {
        file: join(directory, basename(configured.file)),
        directory,
        protectDirectory: configured.isDefault || !directoryExisted,
    };
}
function loadTeams() {
    try {
        const { file } = canonicalTeamsFile(false);
        if (!existsSync(file))
            return {};
        if (lstatSync(file).isSymbolicLink())
            return {};
        const parsed = JSON.parse(readFileSync(file, "utf-8"));
        const teams = Object.create(null);
        for (const [id, value] of Object.entries(parsed)) {
            if (!TEAM_ID_PATTERN.test(id) || !value || typeof value !== "object")
                continue;
            const candidate = value;
            if (candidate.id !== id
                || typeof candidate.name !== "string"
                || !Array.isArray(candidate.members))
                continue;
            const members = candidate.members.filter((member) => Boolean(member
                && typeof member.agentId === "string"
                && ["lead", "worker", "reviewer"].includes(member.role)));
            teams[id] = {
                id,
                name: candidate.name,
                description: typeof candidate.description === "string" ? candidate.description : "",
                members,
                createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
            };
        }
        return teams;
    }
    catch { }
    return {};
}
function saveTeams(teams) {
    const { file, directory, protectDirectory } = canonicalTeamsFile(true);
    if (protectDirectory) {
        try {
            chmodSync(directory, 0o700);
        }
        catch { }
    }
    const temporary = join(directory, `.${basename(file)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
    try {
        writeFileSync(temporary, JSON.stringify(teams, null, 2), { encoding: "utf-8", flag: "wx", mode: 0o600 });
        chmodSync(temporary, 0o600);
        renameSync(temporary, file);
        chmodSync(file, 0o600);
    }
    catch (error) {
        rmSync(temporary, { force: true });
        throw error;
    }
}
/**
 * Create a new agent team.
 */
export function createTeam(id, name, description, members) {
    if (!TEAM_ID_PATTERN.test(id)) {
        return { success: false, error: "Team-ID muss 1-48 Zeichen lang sein und darf nur Buchstaben, Zahlen, _ und - enthalten." };
    }
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
export function addTeamMember(teamId, agentId, role) {
    const teams = loadTeams();
    const team = teams[teamId];
    if (!team)
        return { success: false, error: `Team "${teamId}" nicht gefunden.` };
    const agents = getAllAgents();
    if (!agents[agentId])
        return { success: false, error: `Agent "${agentId}" nicht gefunden.` };
    if (!["lead", "worker", "reviewer"].includes(role)) {
        return { success: false, error: `Ungueltige Rolle "${role}".` };
    }
    if (team.members.some((member) => member.agentId === agentId)) {
        return { success: false, error: `Agent "${agentId}" ist bereits im Team.` };
    }
    team.members.push({ agentId, role });
    saveTeams(teams);
    return { success: true };
}
export function removeTeamMember(teamId, agentId) {
    const teams = loadTeams();
    const team = teams[teamId];
    if (!team)
        return { success: false, error: `Team "${teamId}" nicht gefunden.` };
    const next = team.members.filter((member) => member.agentId !== agentId);
    if (next.length === team.members.length) {
        return { success: false, error: `Agent "${agentId}" ist nicht im Team.` };
    }
    team.members = next;
    saveTeams(teams);
    return { success: true };
}
/**
 * Delete a team.
 */
export function deleteTeam(id) {
    if (!TEAM_ID_PATTERN.test(id))
        return false;
    const teams = loadTeams();
    if (!teams[id])
        return false;
    delete teams[id];
    saveTeams(teams);
    return true;
}
/**
 * Get a team by ID.
 */
export function getTeam(id) {
    if (!TEAM_ID_PATTERN.test(id))
        return null;
    const teams = loadTeams();
    return teams[id] || null;
}
/**
 * List all teams.
 */
export function listTeams() {
    return Object.values(loadTeams());
}
/**
 * Get the execution order for a team (lead first, workers, reviewer last).
 */
export function getTeamExecutionOrder(team) {
    const leads = team.members.filter(m => m.role === "lead");
    const workers = team.members.filter(m => m.role === "worker");
    const reviewers = team.members.filter(m => m.role === "reviewer");
    return [...leads, ...workers, ...reviewers];
}
/**
 * Build team prompt addition for the current agent.
 */
export function buildTeamPrompt(team, currentAgent, previousResults) {
    const allAgents = getAllAgents();
    const parts = [
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
export function formatTeamsList(teams) {
    if (teams.length === 0)
        return "  Keine Teams erstellt.";
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
export function formatTeamDetails(team) {
    const agents = getAllAgents();
    const members = team.members.length === 0
        ? "  (noch keine Mitglieder)"
        : team.members.map((member, index) => {
            const agent = agents[member.agentId];
            return `  ${index + 1}. ${member.agentId} — ${agent?.name || "Unknown"} [${member.role}]`;
        }).join("\n");
    return [
        `${team.name} (${team.id})`,
        team.description || "Keine Beschreibung.",
        "",
        "Mitglieder:",
        members,
        "",
        `Erstellt: ${team.createdAt}`,
    ].join("\n");
}
//# sourceMappingURL=agent-teams.js.map