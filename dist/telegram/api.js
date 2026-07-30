// ─── Telegram Bot API Client (zero dependencies, native fetch) ───────────────
// Thin wrapper over https://api.telegram.org/bot<token>/<method>. Only the
// methods the gateway needs. All network calls go through one `call()` helper
// so retries/timeouts live in a single place.
const TELEGRAM_API = "https://api.telegram.org";
const MAX_MESSAGE_LEN = 4096;
/**
 * Split a long string into Telegram-safe chunks (<= 4096 chars). Prefers to
 * break on newline boundaries; a single line longer than the limit is hard-split.
 * Pure + exported so it can be unit-tested without a network.
 */
export function chunkMessage(text, max = MAX_MESSAGE_LEN) {
    if (text.length <= max)
        return text.length ? [text] : [];
    const chunks = [];
    let current = "";
    for (const line of text.split("\n")) {
        if (line.length > max) {
            if (current) {
                chunks.push(current);
                current = "";
            }
            for (let i = 0; i < line.length; i += max)
                chunks.push(line.slice(i, i + max));
            continue;
        }
        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > max) {
            chunks.push(current);
            current = line;
        }
        else {
            current = candidate;
        }
    }
    if (current)
        chunks.push(current);
    return chunks;
}
export class TelegramClient {
    token;
    constructor(token) {
        this.token = token;
        if (!token)
            throw new Error("TelegramClient: bot token is required");
    }
    async call(method, body, timeoutMs = 65000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(`${TELEGRAM_API}/bot${this.token}/${method}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body ?? {}),
                signal: controller.signal,
            });
            const data = (await res.json());
            if (!data.ok) {
                throw new Error(`Telegram ${method} failed (${data.error_code}): ${data.description}`);
            }
            return data.result;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async getMe() {
        return this.call("getMe", {}, 15000);
    }
    /** Long-poll for updates. `timeout` is the server-side hold time in seconds. */
    async getUpdates(offset, timeout = 50) {
        return this.call("getUpdates", { offset, timeout, allowed_updates: ["message", "callback_query"] }, (timeout + 15) * 1000);
    }
    /** Resolve a file_id to a downloadable file_path. */
    async getFile(fileId) {
        return this.call("getFile", { file_id: fileId }, 15000);
    }
    /** Download a file (by file_path from getFile) and return its bytes. */
    async downloadFile(filePath) {
        const res = await fetch(`${TELEGRAM_API}/file/bot${this.token}/${filePath}`);
        if (!res.ok)
            throw new Error(`Datei-Download fehlgeschlagen: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    }
    async sendChatAction(chatId, action = "typing") {
        try {
            await this.call("sendChatAction", { chat_id: chatId, action }, 10000);
        }
        catch {
            /* non-critical */
        }
    }
    /** Send a (possibly long) message, auto-chunked. Returns the last message_id. */
    async sendMessage(chatId, text, parseMode) {
        let lastId = null;
        for (const chunk of chunkMessage(text)) {
            try {
                const msg = await this.send(chatId, chunk, parseMode);
                lastId = msg?.message_id ?? lastId;
            }
            catch {
                const msg = await this.send(chatId, chunk, undefined);
                lastId = msg?.message_id ?? lastId;
            }
        }
        return lastId;
    }
    send(chatId, text, parseMode) {
        const body = { chat_id: chatId, text, disable_web_page_preview: true };
        if (parseMode)
            body.parse_mode = parseMode;
        return this.call("sendMessage", body, 20000);
    }
    /** Send a message with an inline keyboard (button grid). */
    async sendKeyboard(chatId, text, inlineKeyboard, parseMode) {
        const body = {
            chat_id: chatId,
            text: text.slice(0, MAX_MESSAGE_LEN),
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: inlineKeyboard },
        };
        if (parseMode)
            body.parse_mode = parseMode;
        try {
            const msg = await this.call("sendMessage", body, 20000);
            return msg.message_id;
        }
        catch {
            delete body.parse_mode;
            const msg = await this.call("sendMessage", body, 20000);
            return msg.message_id;
        }
    }
    /** Acknowledge a tapped inline button (stops the loading spinner). */
    async answerCallbackQuery(callbackId, text) {
        try {
            await this.call("answerCallbackQuery", { callback_query_id: callbackId, text: text?.slice(0, 200) }, 10000);
        }
        catch {
            /* non-critical */
        }
    }
    async editMessageText(chatId, messageId, text) {
        try {
            await this.call("editMessageText", { chat_id: chatId, message_id: messageId, text: text.slice(0, MAX_MESSAGE_LEN), disable_web_page_preview: true }, 15000);
        }
        catch {
            /* edit races are non-critical */
        }
    }
}
//# sourceMappingURL=api.js.map