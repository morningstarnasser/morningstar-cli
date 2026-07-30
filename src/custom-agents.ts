import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { AGENTS } from "./agents.js";
import type { Agent } from "./agents.js";

const CONFIG_DIR = join(homedir(), ".morningstar");
const AGENTS_FILE = join(CONFIG_DIR, "agents.json");

// ─── Load all custom agents from ~/.morningstar/agents.json ───
export function loadCustomAgents(): Record<string, Agent> {
  try {
    if (existsSync(AGENTS_FILE)) {
      const raw = readFileSync(AGENTS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      // Validate structure
      const agents: Record<string, Agent> = {};
      for (const [id, data] of Object.entries(parsed)) {
        const a = data as Record<string, unknown>;
        if (a && typeof a.name === "string" && typeof a.systemPrompt === "string") {
          agents[id] = {
            name: a.name,
            description: (a.description as string) || "",
            systemPrompt: a.systemPrompt,
            color: (a.color as string) || "#a855f7",
          };
        }
      }
      return agents;
    }
  } catch {}
  return {};
}

// ─── Save custom agents to disk ───
export function saveCustomAgents(agents: Record<string, Agent>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2), "utf-8");
}

// ─── Create a new custom agent ───
export function createAgent(id: string, agent: Agent): { success: boolean; error?: string } {
  if (AGENTS[id]) {
    return { success: false, error: `"${id}" ist ein Built-in Agent und kann nicht ueberschrieben werden.` };
  }
  const custom = loadCustomAgents();
  if (custom[id]) {
    return { success: false, error: `Agent "${id}" existiert bereits. Nutze /agent:edit ${id} zum Bearbeiten.` };
  }
  custom[id] = agent;
  saveCustomAgents(custom);
  return { success: true };
}

// ─── Edit existing custom agent ───
export function editAgent(id: string, updates: Partial<Agent>): { success: boolean; error?: string } {
  if (AGENTS[id]) {
    return { success: false, error: `"${id}" ist ein Built-in Agent und kann nicht bearbeitet werden.` };
  }
  const custom = loadCustomAgents();
  if (!custom[id]) {
    return { success: false, error: `Agent "${id}" nicht gefunden.` };
  }
  custom[id] = { ...custom[id], ...updates };
  saveCustomAgents(custom);
  return { success: true };
}

// ─── Delete a custom agent ───
export function deleteAgent(id: string): { success: boolean; error?: string } {
  if (AGENTS[id]) {
    return { success: false, error: `"${id}" ist ein Built-in Agent und kann nicht geloescht werden.` };
  }
  const custom = loadCustomAgents();
  if (!custom[id]) {
    return { success: false, error: `Agent "${id}" nicht gefunden.` };
  }
  delete custom[id];
  saveCustomAgents(custom);
  return { success: true };
}

// ─── Get all agents (built-in + custom merged) ───
export function getAllAgents(): Record<string, Agent> {
  const custom = loadCustomAgents();
  return { ...AGENTS, ...custom };
}

// ─── Check if agent is built-in ───
export function isBuiltinAgent(id: string): boolean {
  return id in AGENTS;
}
