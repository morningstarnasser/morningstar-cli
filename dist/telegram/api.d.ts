export interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name?: string;
    username?: string;
}
export interface TelegramVoice {
    file_id: string;
    mime_type?: string;
    duration?: number;
}
export interface TelegramMessage {
    message_id: number;
    from?: TelegramUser;
    chat: {
        id: number;
        type: string;
        title?: string;
        username?: string;
    };
    date: number;
    text?: string;
    voice?: TelegramVoice;
    audio?: TelegramVoice;
}
export interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
}
export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    edited_message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}
export interface InlineButton {
    text: string;
    callback_data: string;
}
/**
 * Split a long string into Telegram-safe chunks (<= 4096 chars). Prefers to
 * break on newline boundaries; a single line longer than the limit is hard-split.
 * Pure + exported so it can be unit-tested without a network.
 */
export declare function chunkMessage(text: string, max?: number): string[];
export declare class TelegramClient {
    private token;
    constructor(token: string);
    private call;
    getMe(): Promise<TelegramUser>;
    /** Long-poll for updates. `timeout` is the server-side hold time in seconds. */
    getUpdates(offset: number, timeout?: number): Promise<TelegramUpdate[]>;
    /** Resolve a file_id to a downloadable file_path. */
    getFile(fileId: string): Promise<{
        file_path?: string;
    }>;
    /** Download a file (by file_path from getFile) and return its bytes. */
    downloadFile(filePath: string): Promise<Buffer>;
    sendChatAction(chatId: number, action?: string): Promise<void>;
    /** Send a (possibly long) message, auto-chunked. Returns the last message_id. */
    sendMessage(chatId: number, text: string, parseMode?: "Markdown" | "HTML"): Promise<number | null>;
    private send;
    /** Send a message with an inline keyboard (button grid). */
    sendKeyboard(chatId: number, text: string, inlineKeyboard: InlineButton[][], parseMode?: "Markdown" | "HTML"): Promise<number | null>;
    /** Acknowledge a tapped inline button (stops the loading spinner). */
    answerCallbackQuery(callbackId: string, text?: string): Promise<void>;
    editMessageText(chatId: number, messageId: number, text: string): Promise<void>;
}
//# sourceMappingURL=api.d.ts.map