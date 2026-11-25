export interface ChannelAccess {
    policy: "pairing" | "allowlist" | "disabled";
    users: number[];
    offset: number;
}
export declare class TelegramAccess {
    private now;
    readonly dir: string;
    readonly file: string;
    state: ChannelAccess;
    private pending;
    constructor(token: string, users?: number[], root?: string, now?: () => number);
    save(): void;
    allowed(user: number, chat: number, type: string): boolean;
    request(user: number, chat: number): string | null;
    pair(code: string): number;
    policy(value: string): void;
    revoke(user: number): void;
    acquire(): () => void;
}
//# sourceMappingURL=channel-access.d.ts.map