// ─── Telegram Per-Chat Session Store ─────────────────────────────────────────
// Each Telegram chat gets its own persistent conversation: message history,
// working directory, and optional model override. Persisted to
// ~/.morningstar/telegram-sessions.json so context survives gateway restarts.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Message } from "../types.js";
import {
  compactMessages,
  type CompactionOptions,
  type CompactionResult,
  type Summarizer,
} from "../runtime/compaction.js";

const STORE_DIR = join(homedir(), ".morningstar");
const STORE_FILE = join(STORE_DIR, "telegram-sessions.json");

export interface ChatSession {
  chatId: number;
  cwd: string;
  model?: string;
  /** Conversation history WITHOUT the system prompt (added fresh per request). */
  messages: Message[];
  updatedAt: number;
}

type SessionMap = Record<string, ChatSession>;

/**
 * Trim conversation history to the most recent `limit` messages while keeping
 * pairs sensible. Pure + exported for testing. Never mutates the input.
 */
export function trimHistory(messages: Message[], limit: number): Message[] {
  if (limit <= 0 || messages.length <= limit) return [...messages];
  return messages.slice(messages.length - limit);
}

export class SessionStore {
  private sessions: SessionMap;

  constructor(
    private defaultCwd: string,
    private historyLimit = 20,
    private clock: () => number = Date.now,
    private storeFile: string | null = STORE_FILE,
  ) {
    this.sessions = this.read();
  }

  private read(): SessionMap {
    if (!this.storeFile) return {};
    try {
      if (existsSync(this.storeFile)) {
        return JSON.parse(readFileSync(this.storeFile, "utf-8")) as SessionMap;
      }
    } catch {
      /* corrupt file → start fresh */
    }
    return {};
  }

  private persist(): void {
    if (!this.storeFile) return;
    try {
      const storeDir = dirname(this.storeFile);
      if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true });
      writeFileSync(this.storeFile, JSON.stringify(this.sessions, null, 2), "utf-8");
    } catch {
      /* best-effort persistence */
    }
  }

  get(chatId: number): ChatSession {
    const key = String(chatId);
    if (!this.sessions[key]) {
      this.sessions[key] = { chatId, cwd: this.defaultCwd, messages: [], updatedAt: this.clock() };
    }
    return this.sessions[key];
  }

  /** Append a message and persist, trimming history to the configured limit. */
  append(chatId: number, message: Message): ChatSession {
    const session = this.get(chatId);
    const next: ChatSession = {
      ...session,
      messages: trimHistory([...session.messages, message], this.historyLimit),
      updatedAt: this.clock(),
    };
    this.sessions[String(chatId)] = next;
    this.persist();
    return next;
  }

  /** Patch session fields (cwd, model) and persist. */
  update(chatId: number, patch: Partial<Omit<ChatSession, "chatId">>): ChatSession {
    const session = this.get(chatId);
    const next: ChatSession = { ...session, ...patch, chatId, updatedAt: this.clock() };
    this.sessions[String(chatId)] = next;
    this.persist();
    return next;
  }

  /** Clear conversation history (keeps cwd + model). */
  reset(chatId: number): ChatSession {
    return this.update(chatId, { messages: [] });
  }

  /**
   * Compact a chat's history if it is over budget, folding old messages into a
   * summary while keeping recent turns verbatim. Additive + opt-in: callers
   * invoke this explicitly; `append`/`trimHistory` behavior is unchanged. When
   * nothing is compacted the session is returned untouched.
   */
  async compact(
    chatId: number,
    options: CompactionOptions = {},
    summarize?: Summarizer,
  ): Promise<{ session: ChatSession; result: CompactionResult }> {
    const session = this.get(chatId);
    const result = await compactMessages(session.messages, options, summarize);
    if (!result.compacted) return { session, result };
    const next: ChatSession = { ...session, messages: result.messages, updatedAt: this.clock() };
    this.sessions[String(chatId)] = next;
    this.persist();
    return { session: next, result };
  }
}

export const TELEGRAM_SESSIONS_PATH = STORE_FILE;
