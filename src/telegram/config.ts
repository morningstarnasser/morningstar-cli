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

export interface TelegramConfig {
  /** Bot token from @BotFather. */
  token: string;
  /** Telegram numeric user IDs allowed to talk to the bot. */
  allowedUsers: number[];
  /** Optional model override for the gateway agent (e.g. "claude-fable-5"). */
  model?: string;
  /** Default working directory the agent operates in. */
  defaultCwd?: string;
  /** Max model<->tool turns per request. */
  maxTurns?: number;
  /** How many recent messages to keep per chat session. */
  historyLimit?: number;
  /**
   * Explicitly opted-in fallback models. Omission disables fallback so a local
   * primary never crosses into a hosted provider unexpectedly.
   */
  fallbackModels?: string[];
  /** Cron schedule for the nightly learning distillation (default 21:30). */
  distillSchedule?: string;
  /** Whether the nightly distillation runs (default true). */
  distillEnabled?: boolean;
}

/**
 * Parse a comma/space separated allow-list string into numeric user IDs.
 * Pure + exported for testing. Invalid entries are dropped.
 */
export function parseAllowedUsers(raw: string | undefined | null): number[] {
  if (!raw) return [];
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
export function isUserAllowed(userId: number | undefined, allowedUsers: number[]): boolean {
  if (userId === undefined) return false;
  if (allowedUsers.length === 0) return false;
  return allowedUsers.includes(userId);
}

const MAX_FALLBACK_MODELS = 20;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+~-]*$/;

/** Fail closed unless the global Telegram config contains explicit model IDs. */
export function normalizeFallbackModels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const models = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) =>
      value.length > 0
      && value.length <= 256
      && SAFE_MODEL_ID.test(value));
  return [...new Set(models)].slice(0, MAX_FALLBACK_MODELS);
}

function readJsonFile(): Partial<TelegramConfig> {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Partial<TelegramConfig>;
    }
  } catch {
    /* fall through to defaults */
  }
  return {};
}

/** Resolve the full gateway config from env + JSON file. */
export function loadTelegramConfig(): TelegramConfig {
  const file = readJsonFile();
  const envAllowed = parseAllowedUsers(process.env.TELEGRAM_ALLOWED_USERS);

  return {
    token: process.env.TELEGRAM_BOT_TOKEN || file.token || "",
    allowedUsers: envAllowed.length > 0 ? envAllowed : file.allowedUsers ?? [],
    model: process.env.MORNINGSTAR_TELEGRAM_MODEL || file.model,
    defaultCwd: process.env.MORNINGSTAR_TELEGRAM_CWD || file.defaultCwd || process.cwd(),
    maxTurns: file.maxTurns ?? 12,
    historyLimit: file.historyLimit ?? 20,
    fallbackModels: normalizeFallbackModels(file.fallbackModels),
    distillSchedule: file.distillSchedule ?? "30 21 * * *",
    distillEnabled: file.distillEnabled ?? true,
  };
}

/** Persist a config file (used by `morningstar telegram setup`). */
export function saveTelegramConfig(config: Partial<TelegramConfig>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  try { chmodSync(CONFIG_DIR, 0o700); } catch {}
  const existing = readJsonFile();
  writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ ...existing, ...config }, null, 2),
    { encoding: "utf-8", mode: 0o600 },
  );
  try { chmodSync(CONFIG_FILE, 0o600); } catch {}
}

export const TELEGRAM_CONFIG_PATH = CONFIG_FILE;
