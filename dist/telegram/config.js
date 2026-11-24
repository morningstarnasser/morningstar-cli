// ─── Telegram Gateway Config + Allow-List Security ───────────────────────────
// Resolves the bot token, the allow-list of Telegram user IDs, and agent
// defaults from (in priority order) environment variables and
// ~/.morningstar/telegram.json. Environment always wins so secrets can stay out
// of the JSON file.
import { chmodSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "telegram.json");
/**
 * Parse a comma/space separated allow-list string into numeric user IDs.
 * Pure + exported for testing. Invalid entries are dropped.
 */
export function parseAllowedUsers(raw) {
    if (!raw)
        return [];
    return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0);
}
/**
 * Security gate: is this user allowed to use the bot?
 * Fails closed — an empty allow-list denies everyone.
 */
export function isUserAllowed(userId, allowedUsers) {
    if (userId === undefined)
        return false;
    if (allowedUsers.length === 0)
        return false;
    return allowedUsers.includes(userId);
}
const MAX_FALLBACK_MODELS = 20;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+~-]*$/;
/** Fail closed unless the global Telegram config contains explicit model IDs. */
export function normalizeFallbackModels(raw) {
    if (!Array.isArray(raw))
        return [];
    const models = raw
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0
        && value.length <= 256
        && SAFE_MODEL_ID.test(value));
    return [...new Set(models)].slice(0, MAX_FALLBACK_MODELS);
}
function readJsonFile() {
    try {
        if (existsSync(CONFIG_FILE)) {
            return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
        }
    }
    catch {
        /* fall through to defaults */
    }
    return {};
}
/** Resolve the full gateway config from env + JSON file. */
export function loadTelegramConfig() {
    const file = readJsonFile();
    const envAllowed = parseAllowedUsers(process.env.TELEGRAM_ALLOWED_USERS);
    return {
        token: process.env.TELEGRAM_BOT_TOKEN || file.token || "",
        allowedUsers: envAllowed.length > 0 ? envAllowed : file.allowedUsers ?? [],
        model: process.env.MORNINGSTAR_TELEGRAM_MODEL || file.model,
        defaultCwd: process.env.MORNINGSTAR_TELEGRAM_CWD || file.defaultCwd || process.cwd(),
        maxTurns: file.maxTurns ?? 0,
        historyLimit: file.historyLimit ?? 20,
        fallbackModels: normalizeFallbackModels(file.fallbackModels),
        distillSchedule: file.distillSchedule ?? "30 21 * * *",
        distillEnabled: file.distillEnabled ?? true,
    };
}
/** Persist a config file (used by `morningstar telegram setup`). */
export function saveTelegramConfig(config) {
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    try {
        chmodSync(CONFIG_DIR, 0o700);
    }
    catch { }
    const existing = readJsonFile();
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...config }, null, 2), { encoding: "utf-8", mode: 0o600 });
    try {
        chmodSync(CONFIG_FILE, 0o600);
    }
    catch { }
}
export const TELEGRAM_CONFIG_PATH = CONFIG_FILE;
//# sourceMappingURL=config.js.map