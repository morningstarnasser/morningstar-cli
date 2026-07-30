// ─── Input History for Ctrl+R ────────────────────────────
// Persistent input history stored in ~/.morningstar/input-history.json
import { chmodSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".morningstar");
const HISTORY_FILE = join(CONFIG_DIR, "input-history.json");
const MAX_ENTRIES = 500;
let history = null;
function ensureDir() {
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    try {
        chmodSync(CONFIG_DIR, 0o700);
    }
    catch { }
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
        writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), {
            encoding: "utf-8",
            mode: 0o600,
        });
        try {
            chmodSync(HISTORY_FILE, 0o600);
        }
        catch { }
    }
    catch { }
}
const SENSITIVE_INPUT_PATTERNS = [
    /(?:^|\s)--api-key(?:=|\s+)\S+/i,
    /^\/config\s+set\s+\S*(?:api[_-]?keys?|token|secret|password)\S*\s+\S+/i,
    /(?:^|\s)(?:export\s+)?[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*["']?\S+/,
    /\bsk-(?:ant-|proj-|org-)?[A-Za-z0-9_-]{8,}\b/,
    /\b(?:gh[pousr]_|hf_|gsk_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/,
    /\bnvapi-[A-Za-z0-9_-]{8,}\b/,
    /\bAIza[A-Za-z0-9_-]{20,}\b/,
    /\b\d{7,12}:AA[A-Za-z0-9_-]{20,}\b/,
];
/**
 * Inputs that look like credentials must never be persisted to disk. This is
 * deliberately conservative: losing one history entry is safer than retaining
 * a secret in plaintext.
 */
export function isSensitiveInput(input) {
    return SENSITIVE_INPUT_PATTERNS.some((pattern) => pattern.test(input.trim()));
}
/**
 * Add an input to the persistent history.
 */
export function addToInputHistory(input) {
    if (isSensitiveInput(input))
        return;
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