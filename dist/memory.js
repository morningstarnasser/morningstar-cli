import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".morningstar");
const MEMORY_FILE = join(CONFIG_DIR, "memory.json");
function ensureDir() {
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true });
}
export function loadMemories() {
    try {
        if (existsSync(MEMORY_FILE)) {
            return JSON.parse(readFileSync(MEMORY_FILE, "utf-8"));
        }
    }
    catch { }
    return [];
}
function saveMemories(memories) {
    ensureDir();
    writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), "utf-8");
}
export function addMemory(text, tags = []) {
    const memories = loadMemories();
    const id = memories.length > 0 ? Math.max(...memories.map(m => m.id)) + 1 : 1;
    const entry = {
        id,
        text,
        tags,
        createdAt: new Date().toISOString(),
    };
    memories.push(entry);
    saveMemories(memories);
    return entry;
}
export function removeMemory(id) {
    const memories = loadMemories();
    const idx = memories.findIndex(m => m.id === id);
    if (idx === -1)
        return false;
    memories.splice(idx, 1);
    saveMemories(memories);
    return true;
}
export function searchMemories(query) {
    const memories = loadMemories();
    const q = query.toLowerCase();
    return memories.filter(m => m.text.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q)));
}
export function clearMemories() {
    const memories = loadMemories();
    const count = memories.length;
    saveMemories([]);
    return count;
}
// Build memory context string for system prompt injection
export function getMemoryContext() {
    const memories = loadMemories();
    if (memories.length === 0)
        return "";
    const lines = memories.map(m => `- ${m.text}${m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : ""}`);
    return `\n--- Gespeicherte Notizen ---\n${lines.join("\n")}\n`;
}
//# sourceMappingURL=memory.js.map