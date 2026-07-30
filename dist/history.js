import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".morningstar");
const HISTORY_DIR = join(CONFIG_DIR, "history");
function ensureDir() {
    if (!existsSync(HISTORY_DIR))
        mkdirSync(HISTORY_DIR, { recursive: true });
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
export function saveConversation(name, messages, model, project) {
    ensureDir();
    const id = generateId();
    const conv = {
        id,
        name,
        messages,
        model,
        project,
        savedAt: new Date().toISOString(),
        messageCount: messages.length,
    };
    writeFileSync(join(HISTORY_DIR, `${id}.json`), JSON.stringify(conv, null, 2), "utf-8");
    return conv;
}
export function loadConversation(id) {
    const filePath = join(HISTORY_DIR, `${id}.json`);
    try {
        if (existsSync(filePath)) {
            return JSON.parse(readFileSync(filePath, "utf-8"));
        }
    }
    catch { }
    return null;
}
export function listConversations() {
    ensureDir();
    try {
        const files = readdirSync(HISTORY_DIR).filter(f => f.endsWith(".json"));
        const convs = files.map(f => {
            try {
                const data = JSON.parse(readFileSync(join(HISTORY_DIR, f), "utf-8"));
                return { id: data.id, name: data.name, savedAt: data.savedAt, messageCount: data.messageCount, project: data.project };
            }
            catch {
                return null;
            }
        }).filter(Boolean);
        return convs.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    }
    catch {
        return [];
    }
}
export function deleteConversation(id) {
    const filePath = join(HISTORY_DIR, `${id}.json`);
    try {
        if (existsSync(filePath)) {
            unlinkSync(filePath);
            return true;
        }
    }
    catch { }
    return false;
}
export function getLastConversation() {
    const list = listConversations();
    if (list.length === 0)
        return null;
    return loadConversation(list[0].id);
}
// ─── Auto-Save ────────────────────────────────────────────
const AUTOSAVE_DIR = join(CONFIG_DIR, "autosave");
function ensureAutoSaveDir() {
    if (!existsSync(AUTOSAVE_DIR))
        mkdirSync(AUTOSAVE_DIR, { recursive: true });
}
export function autoSave(messages, projectName, model) {
    ensureAutoSaveDir();
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = join(AUTOSAVE_DIR, `${safeName}.json`);
    try {
        const data = {
            id: `autosave-${safeName}`,
            name: `AutoSave: ${projectName}`,
            messages,
            model,
            project: projectName,
            savedAt: new Date().toISOString(),
            messageCount: messages.length,
        };
        writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    }
    catch { }
}
export function getLastAutoSave(projectName) {
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = join(AUTOSAVE_DIR, `${safeName}.json`);
    try {
        if (existsSync(filePath)) {
            return JSON.parse(readFileSync(filePath, "utf-8"));
        }
    }
    catch { }
    return null;
}
//# sourceMappingURL=history.js.map