import type { ImageAttachment } from "../types.js";
import type { RemoteSnapshot, RemoteAction } from "../remote-control.js";
import { TelegramClient, type TelegramUpdate } from "./api.js";
import { TelegramAccess } from "./channel-access.js";
type Client = Pick<TelegramClient, "getMe" | "getUpdates" | "sendMessage" | "sendKeyboard" | "editMessageText" | "answerCallbackQuery" | "sendChatAction" | "getFile" | "downloadFile"> & Partial<Pick<TelegramClient, "sendFile" | "react" | "editOwnMessage">>;
export interface TelegramChannelOptions {
    token: string;
    allowedUsers?: number[];
    root?: string;
    client?: Client;
    snapshot: () => RemoteSnapshot;
    message: (text: string, images?: ImageAttachment[]) => Promise<void>;
    action: (action: RemoteAction) => void | Promise<void>;
    notice: (message: string) => void;
}
/** Telegram is a transport for the existing TUI session, not another agent. */
export declare class TelegramChannel {
    private options;
    readonly access: TelegramAccess;
    readonly client: Client;
    username: string;
    running: boolean;
    private controller;
    private release?;
    private unregister?;
    private sentMessages;
    private timer?;
    private queue;
    private active?;
    private callbacks;
    private approvalSent;
    private ticking;
    private connectedAt;
    private linked?;
    constructor(options: TelegramChannelOptions);
    start(poll?: boolean): Promise<string>;
    stop(): void;
    private tool;
    private poll;
    private button;
    handle(update: TelegramUpdate): Promise<void>;
    private status;
    private attachment;
    tick(): Promise<void>;
}
export {};
//# sourceMappingURL=channel.d.ts.map