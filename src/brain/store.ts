// ─── Brain Store — persistent long-term memory ───────────────────────────────
// Append-only-ish JSON store of memories the agent accumulates across sessions
// (manual /remember, task outcomes, nightly distillations). Retrieval is handled
// by ./retrieve. Stored at ~/.morningstar/brain.json.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BrainMemory } from "./retrieve.js";
import { retrieve, formatRecall, type ScoredMemory } from "./retrieve.js";

const STORE_DIR = join(homedir(), ".morningstar");
const STORE_FILE = join(STORE_DIR, "brain.json");

const MAX_MEMORIES = 2000; // bound the file; oldest non-decision memories trimmed first

export class Brain {
  private memories: BrainMemory[];

  constructor(private clock: () => number = Date.now) {
    this.memories = this.read();
  }

  private read(): BrainMemory[] {
    try {
      if (existsSync(STORE_FILE)) return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as BrainMemory[];
    } catch {
      /* corrupt → empty */
    }
    return [];
  }

  private persist(): void {
    try {
      if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
      writeFileSync(STORE_FILE, JSON.stringify(this.memories, null, 2), "utf-8");
    } catch {
      /* best-effort */
    }
  }

  private genId(): string {
    return `${this.clock().toString(36)}${Math.floor((this.clock() % 1000)).toString(36)}`;
  }

  /** Store a new memory. Trims the corpus if it grows past MAX_MEMORIES. */
  remember(text: string, kind: BrainMemory["kind"] = "note", tags: string[] = []): BrainMemory {
    const memory: BrainMemory = { id: this.genId(), text: text.trim(), kind, tags, createdAt: this.clock() };
    this.memories = [...this.memories, memory];
    if (this.memories.length > MAX_MEMORIES) this.trim();
    this.persist();
    return memory;
  }

  /** Keep decisions/facts; drop the oldest notes/outcomes when over capacity. */
  private trim(): void {
    const keep = this.memories.filter((m) => m.kind === "decision" || m.kind === "fact");
    const rest = this.memories
      .filter((m) => m.kind === "note" || m.kind === "outcome")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_MEMORIES - keep.length);
    this.memories = [...keep, ...rest];
  }

  recall(query: string, k = 4): ScoredMemory[] {
    return retrieve(query, this.memories, k, this.clock());
  }

  recallText(query: string, k = 4): string {
    return formatRecall(this.recall(query, k));
  }

  /** Memories of a kind created within the last `sinceMs` (default: all). */
  recent(kind: BrainMemory["kind"], sinceMs?: number, now = this.clock()): BrainMemory[] {
    return this.memories.filter(
      (m) => m.kind === kind && (sinceMs === undefined || m.createdAt >= now - sinceMs),
    );
  }

  count(): number {
    return this.memories.length;
  }
}

export const BRAIN_STORE_PATH = STORE_FILE;
