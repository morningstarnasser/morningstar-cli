import { randomUUID } from "node:crypto";
import { saveConversation, loadConversation, listConversations, type SavedConversation } from "./history.js";
import type { Message } from "./types.js";

export const cleanSessionName = (name: string): string => {
  const value = name.trim();
  if (!value || value.length > 120 || /[\x00-\x1f\x7f-\x9f]/.test(value)) throw new Error("Sessionname: 1–120 Zeichen ohne Steuerzeichen.");
  return value;
};
export interface SessionStore {
  save: typeof saveConversation;
  load: typeof loadConversation;
  list: typeof listConversations;
}

/** Identity and history move together; clearing context never reuses an old ID. */
export class SessionController {
  id: string;
  name: string;
  messages: Message[];
  constructor(public project: string, public model: string, messages: Message[], options: { id?: string; name?: string; persist?: boolean; store?: SessionStore } = {}) {
    this.id = options.id ?? randomUUID(); this.name = options.name ?? ""; this.messages = messages;
    this.persist = options.persist !== false;
    this.store = options.store ?? { save: saveConversation, load: loadConversation, list: listConversations };
  }
  private persist: boolean;
  private store: SessionStore;
  update(messages: Message[], model = this.model) { this.messages = messages; this.model = model; }
  save(): SavedConversation | undefined {
    if (!this.persist || !this.messages.some(m => m.role === "user" && !m.contextKind)) return;
    this.name ||= this.messages.find(m => m.role === "user" && !m.contextKind)!.content.replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 80) || "Neue Sitzung";
    return this.store.save(this.name, this.messages, this.model, this.project, this.id);
  }
  fresh(system: string, name?: string) {
    const nextName = name ? cleanSessionName(name) : "";
    this.save(); this.id = randomUUID(); this.name = nextName;
    this.messages = [{ role: "system", content: system }];
  }
  resume(reference: string, system: string): SavedConversation {
    const next = this.store.load(reference);
    if (!next) throw new Error(`Session "${reference}" nicht gefunden.`);
    if (next.project !== this.project) throw new Error(`Diese Sitzung gehört zu ${next.project}. Öffne Morningstar dort, um sie fortzusetzen.`);
    this.save(); this.id = next.id; this.name = next.name;
    this.messages = [{ role: "system", content: system }, ...next.messages.filter(m => m.role !== "system")];
    return next;
  }
  checkpoint(): string | undefined {
    if (!this.persist || !this.messages.some(m => m.role === "user" && !m.contextKind)) return;
    const id = randomUUID();
    this.store.save(`Vor Rewind · ${this.name || "Sitzung"}`.slice(0, 120), this.messages, this.model, this.project, id);
    return id;
  }
  rename(name: string) { this.name = cleanSessionName(name); this.save(); }
  list() { return this.store.list().filter(s => s.project === this.project); }
}
