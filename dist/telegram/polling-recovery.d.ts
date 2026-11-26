export interface TelegramConnectionState {
    status: "connected" | "reconnecting" | "stopped";
    consecutiveFailures: number;
    lastSuccessAt?: number;
    lastFailureAt?: number;
    lastError?: string;
    nextRetryAt?: number;
}
export declare class TelegramPollingRecovery {
    private now;
    state: TelegramConnectionState;
    private outageAt?;
    private lastNoticeAt?;
    constructor(now?: () => number);
    failure(error: unknown): {
        fatal: boolean;
        delayMs: number;
        notice?: string;
    };
    success(): string | undefined;
    stop(): void;
}
export declare function waitForTelegramRetry(ms: number, signal: AbortSignal): Promise<void>;
//# sourceMappingURL=polling-recovery.d.ts.map