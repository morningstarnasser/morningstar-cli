// ─── Telegram Bot API Client (zero dependencies, native fetch) ───────────────
// Thin wrapper over https://api.telegram.org/bot<token>/<method>. Only the
// methods the gateway needs. All network calls go through one `call()` helper
// so retries/timeouts live in a single place.

const TELEGRAM_API = "https://api.telegram.org";
const MAX_MESSAGE_LEN = 4096;

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
  chat: { id: number; type: string; title?: string; username?: string };
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

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Split a long string into Telegram-safe chunks (<= 4096 chars). Prefers to
 * break on newline boundaries; a single line longer than the limit is hard-split.
 * Pure + exported so it can be unit-tested without a network.
 */
export function chunkMessage(text: string, max = MAX_MESSAGE_LEN): string[] {
  if (text.length <= max) return text.length ? [text] : [];
  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    if (line.length > max) {
      if (current) { chunks.push(current); current = ""; }
      for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max));
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > max) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export class TelegramClient {
  constructor(private token: string) {
    if (!token) throw new Error("TelegramClient: bot token is required");
  }

  private async call<T>(method: string, body?: Record<string, unknown>, timeoutMs = 65000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
      const data = (await res.json()) as TelegramResponse<T>;
      if (!data.ok) {
        throw new Error(`Telegram ${method} failed (${data.error_code}): ${data.description}`);
      }
      return data.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>("getMe", {}, 15000);
  }

  /** Long-poll for updates. `timeout` is the server-side hold time in seconds. */
  async getUpdates(offset: number, timeout = 50): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(
      "getUpdates",
      { offset, timeout, allowed_updates: ["message", "callback_query"] },
      (timeout + 15) * 1000,
    );
  }

  /** Resolve a file_id to a downloadable file_path. */
  async getFile(fileId: string): Promise<{ file_path?: string }> {
    return this.call<{ file_path?: string }>("getFile", { file_id: fileId }, 15000);
  }

  /** Download a file (by file_path from getFile) and return its bytes. */
  async downloadFile(filePath: string): Promise<Buffer> {
    const res = await fetch(`${TELEGRAM_API}/file/bot${this.token}/${filePath}`);
    if (!res.ok) throw new Error(`Datei-Download fehlgeschlagen: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async sendChatAction(chatId: number, action = "typing"): Promise<void> {
    try {
      await this.call("sendChatAction", { chat_id: chatId, action }, 10000);
    } catch {
      /* non-critical */
    }
  }

  /** Send a (possibly long) message, auto-chunked. Returns the last message_id. */
  async sendMessage(chatId: number, text: string, parseMode?: "Markdown" | "HTML"): Promise<number | null> {
    let lastId: number | null = null;
    for (const chunk of chunkMessage(text)) {
      try {
        const msg = await this.send(chatId, chunk, parseMode);
        lastId = msg?.message_id ?? lastId;
      } catch {
        const msg = await this.send(chatId, chunk, undefined);
        lastId = msg?.message_id ?? lastId;
      }
    }
    return lastId;
  }

  private send(chatId: number, text: string, parseMode?: "Markdown" | "HTML"): Promise<TelegramMessage> {
    const body: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true };
    if (parseMode) body.parse_mode = parseMode;
    return this.call<TelegramMessage>("sendMessage", body, 20000);
  }

  /** Send a message with an inline keyboard (button grid). */
  async sendKeyboard(chatId: number, text: string, inlineKeyboard: InlineButton[][], parseMode?: "Markdown" | "HTML"): Promise<number | null> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: text.slice(0, MAX_MESSAGE_LEN),
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: inlineKeyboard },
    };
    if (parseMode) body.parse_mode = parseMode;
    try {
      const msg = await this.call<TelegramMessage>("sendMessage", body, 20000);
      return msg.message_id;
    } catch {
      delete body.parse_mode;
      const msg = await this.call<TelegramMessage>("sendMessage", body, 20000);
      return msg.message_id;
    }
  }

  /** Acknowledge a tapped inline button (stops the loading spinner). */
  async answerCallbackQuery(callbackId: string, text?: string): Promise<void> {
    try {
      await this.call("answerCallbackQuery", { callback_query_id: callbackId, text: text?.slice(0, 200) }, 10000);
    } catch {
      /* non-critical */
    }
  }

  async editMessageText(chatId: number, messageId: number, text: string): Promise<void> {
    try {
      await this.call(
        "editMessageText",
        { chat_id: chatId, message_id: messageId, text: text.slice(0, MAX_MESSAGE_LEN), disable_web_page_preview: true },
        15000,
      );
    } catch {
      /* edit races are non-critical */
    }
  }
}
