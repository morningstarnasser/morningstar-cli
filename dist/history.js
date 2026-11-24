import { isImageAttachment } from "./runtime/images.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, lstatSync, renameSync, chmodSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".morningstar");
const HISTORY_DIR = join(CONFIG_DIR, "history");
function privateDirectory(path) {
    try {
        const stat = lstatSync(path);
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new Error("Session directory must not be a symlink");
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
        mkdirSync(path, { mode: 0o700 });
    }
    chmodSync(path, 0o700);
}
function ensureDir() { privateDirectory(CONFIG_DIR); privateDirectory(HISTORY_DIR); }
function writeSession(path, data) {
    const temporary = join(dirname(path), `.session-${randomBytes(12).toString("hex")}.tmp`);
    try {
        writeFileSync(temporary, JSON.stringify(data, null, 2), { flag: "wx", mode: 0o600 });
        renameSync(temporary, path);
    }
    finally {
        rmSync(temporary, { force: true });
    }
}
function readSession(path) {
    try {
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024)
            return null;
        const data = JSON.parse(readFileSync(path, "utf8"));
        if ((!ID_PATTERN.test(data.id) && !/^autosave-[a-zA-Z0-9_-]+$/.test(data.id)) || (basename(path) !== `${data.id}.json` && basename(path) !== `${String(data.id).replace(/^autosave-/, "")}.json`) || typeof data.name !== "string" || typeof data.project !== "string" || typeof data.savedAt !== "string" || !Number.isFinite(Date.parse(data.savedAt)) || !Array.isArray(data.messages))
            return null;
        if (data.messages.some((m) => !m || !["system", "user", "assistant", "tool"].includes(m.role) || typeof m.content !== "string" || (m.images !== undefined && (!Array.isArray(m.images) || !m.images.every(isImageAttachment)))))
            return null;
        return { ...data, messageCount: data.messages.length };
    }
    catch {
        return null;
    }
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
/**
 * Ids we generate ourselves: lowercase base36 only. Anything else must never
 * reach the filesystem — a reference like `../../config` would otherwise read
 * or delete files outside the history directory.
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Path for an id, or null when the id could escape the history directory. */
function conversationPath(id) {
    return ID_PATTERN.test(id) ? join(HISTORY_DIR, `${id}.json`) : null;
}
/**
 * Resolve what the user typed to a stored id.
 *
 * Sessions are saved under a *name* but addressed by *id*, so `/history load
 * allgemein` has to work as well as `/history load ms70ygx68aek`. Order, most
 * precise first: exact id, exact name (case-insensitive), unique id prefix,
 * unique partial name. Ambiguity resolves to nothing rather than a guess.
 */
export function resolveConversationId(reference) {
    const needle = reference.trim();
    if (!needle)
        return null;
    const all = listConversations();
    const exactId = all.find((conv) => conv.id === needle);
    if (exactId)
        return exactId.id;
    const lowered = needle.toLowerCase();
    const exactName = all.filter((conv) => conv.name.toLowerCase() === lowered);
    // listConversations is newest-first, so the freshest match wins.
    if (exactName.length > 0)
        return exactName[0].id;
    const idPrefix = all.filter((conv) => conv.id.startsWith(needle));
    if (idPrefix.length === 1)
        return idPrefix[0].id;
    const partialName = all.filter((conv) => conv.name.toLowerCase().includes(lowered));
    if (partialName.length === 1)
        return partialName[0].id;
    return null;
}
/**
 * Persist a conversation. Passing `existingId` overwrites that session instead
 * of creating a copy, which is what renaming an open session must do.
 */
export function saveConversation(name, messages, model, project, existingId) {
    ensureDir();
    const reusable = existingId && conversationPath(existingId) ? existingId : undefined;
    const id = reusable ?? generateId();
    const conv = {
        id,
        name,
        messages,
        model,
        project,
        savedAt: new Date().toISOString(),
        messageCount: messages.length,
    };
    const filePath = conversationPath(id);
    if (filePath) {
        writeSession(filePath, conv);
    }
    return conv;
}
/** Load by id or by name. Returns null when nothing matches unambiguously. */
export function loadConversation(reference) {
    const id = resolveConversationId(reference);
    if (!id)
        return null;
    const filePath = conversationPath(id);
    if (!filePath)
        return null;
    try {
        if (existsSync(filePath)) {
            return readSession(filePath);
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
                const data = readSession(join(HISTORY_DIR, f));
                if (!data)
                    return null;
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
/** Delete by id or by name, with the same resolution rules as loading. */
export function deleteConversation(reference) {
    const id = resolveConversationId(reference);
    if (!id)
        return false;
    const filePath = conversationPath(id);
    if (!filePath)
        return false;
    try {
        if (existsSync(filePath)) {
            unlinkSync(filePath);
            return true;
        }
    }
    catch { }
    return false;
}
export function getLastConversation(project) {
    const list = listConversations().filter((entry) => !project || entry.project === project);
    if (list.length === 0)
        return null;
    return loadConversation(list[0].id);
}
// ─── Auto-Save ────────────────────────────────────────────
const AUTOSAVE_DIR = join(CONFIG_DIR, "autosave");
function ensureAutoSaveDir() {
    privateDirectory(CONFIG_DIR);
    privateDirectory(AUTOSAVE_DIR);
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
        writeSession(filePath, data);
    }
    catch { }
}
export function getLastAutoSave(projectName) {
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = join(AUTOSAVE_DIR, `${safeName}.json`);
    try {
        if (existsSync(filePath)) {
            return readSession(filePath);
        }
    }
    catch { }
    return null;
}
//# sourceMappingURL=history.js.map