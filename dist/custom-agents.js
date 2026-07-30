import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { AGENTS } from "./agents.js";
const CONFIG_DIR = join(homedir(), ".morningstar");
const AGENTS_FILE = join(CONFIG_DIR, "agents.json");
// ─── Load all custom agents from ~/.morningstar/agents.json ───
export function loadCustomAgents() {
    try {
        if (existsSync(AGENTS_FILE)) {
            const raw = readFileSync(AGENTS_FILE, "utf-8");
            const parsed = JSON.parse(raw);
            // Validate structure
            const agents = {};
            for (const [id, data] of Object.entries(parsed)) {
                const a = data;
                if (a && typeof a.name === "string" && typeof a.systemPrompt === "string") {
                    agents[id] = {
                        name: a.name,
                        description: a.description || "",
                        systemPrompt: a.systemPrompt,
                        color: a.color || "#a855f7",
                    };
                }
            }
            return agents;
        }
    }
    catch { }
    return {};
}
// ─── Save custom agents to disk ───
export function saveCustomAgents(agents) {
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2), "utf-8");
}
// ─── Create a new custom agent ───
export function createAgent(id, agent) {
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
export function editAgent(id, updates) {
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
export function deleteAgent(id) {
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
export function getAllAgents() {
    const custom = loadCustomAgents();
    return { ...AGENTS, ...custom };
}
// ─── Check if agent is built-in ───
export function isBuiltinAgent(id) {
    return id in AGENTS;
}
//# sourceMappingURL=custom-agents.js.map