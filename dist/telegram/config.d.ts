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
export declare function parseAllowedUsers(raw: string | undefined | null): number[];
/**
 * Security gate: is this user allowed to use the bot?
 * Fails closed — an empty allow-list denies everyone.
 */
export declare function isUserAllowed(userId: number | undefined, allowedUsers: number[]): boolean;
/** Fail closed unless the global Telegram config contains explicit model IDs. */
export declare function normalizeFallbackModels(raw: unknown): string[];
/** Resolve the full gateway config from env + JSON file. */
export declare function loadTelegramConfig(): TelegramConfig;
/** Persist a config file (used by `morningstar telegram setup`). */
export declare function saveTelegramConfig(config: Partial<TelegramConfig>): void;
export declare const TELEGRAM_CONFIG_PATH: string;
//# sourceMappingURL=config.d.ts.map