// ─── Input History for Ctrl+R ────────────────────────────
// Persistent input history stored in ~/.morningstar/input-history.json
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".morningstar");
const HISTORY_FILE = join(CONFIG_DIR, "input-history.json");
const MAX_ENTRIES = 500;
let history = null;
function ensureDir() {
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true });
}
function load() {
    if (history !== null)
        return history;
    try {
        if (existsSync(HISTORY_FILE)) {
            history = JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
            return history;
        }
    }
    catch { }
    history = [];
    return history;
}
function save() {
    ensureDir();
    try {
        writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
    }
    catch { }
}
/**
 * Add an input to the persistent history.
 */
export function addToInputHistory(input) {
    const entries = load();
    // Remove duplicates
    const idx = entries.findIndex(e => e.input === input);
    if (idx !== -1)
        entries.splice(idx, 1);
    entries.push({ input, timestamp: new Date().toISOString() });
    // Trim to max entries
    if (entries.length > MAX_ENTRIES) {
        entries.splice(0, entries.length - MAX_ENTRIES);
    }
    save();
}
/**
 * Search input history by query.
 */
export function searchInputHistory(query) {
    const entries = load();
    const lower = query.toLowerCase();
    return entries
        .filter(e => e.input.toLowerCase().includes(lower))
        .map(e => e.input)
        .reverse(); // Most recent first
}
/**
 * Get all input history entries (most recent first).
 */
export function getInputHistory() {
    return load().map(e => e.input).reverse();
}
/**
 * Clear input history.
 */
export function clearInputHistory() {
    history = [];
    save();
}
//# sourceMappingURL=input-history.js.map