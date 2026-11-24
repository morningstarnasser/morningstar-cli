import { randomUUID } from "node:crypto";
import { saveConversation, loadConversation, listConversations } from "./history.js";
export const cleanSessionName = (name) => {
    const value = name.trim();
    if (!value || value.length > 120 || /[\x00-\x1f\x7f-\x9f]/.test(value))
        throw new Error("Sessionname: 1–120 Zeichen ohne Steuerzeichen.");
    return value;
};
/** Identity and history move together; clearing context never reuses an old ID. */
export class SessionController {
    project;
    model;
    id;
    name;
    messages;
    constructor(project, model, messages, options = {}) {
        this.project = project;
        this.model = model;
        this.id = options.id ?? randomUUID();
        this.name = options.name ?? "";
        this.messages = messages;
        this.persist = options.persist !== false;
        this.store = options.store ?? { save: saveConversation, load: loadConversation, list: listConversations };
    }
    persist;
    store;
    update(messages, model = this.model) { this.messages = messages; this.model = model; }
    save() {
        if (!this.persist || !this.messages.some(m => m.role === "user" && !m.contextKind))
            return;
        this.name ||= this.messages.find(m => m.role === "user" && !m.contextKind).content.replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 80) || "Neue Sitzung";
        return this.store.save(this.name, this.messages, this.model, this.project, this.id);
    }
    fresh(system, name) {
        const nextName = name ? cleanSessionName(name) : "";
        this.save();
        this.id = randomUUID();
        this.name = nextName;
        this.messages = [{ role: "system", content: system }];
    }
    resume(reference, system) {
        const next = this.store.load(reference);
        if (!next)
            throw new Error(`Session "${reference}" nicht gefunden.`);
        if (next.project !== this.project)
            throw new Error(`Diese Sitzung gehört zu ${next.project}. Öffne Morningstar dort, um sie fortzusetzen.`);
        this.save();
        this.id = next.id;
        this.name = next.name;
        this.messages = [{ role: "system", content: system }, ...next.messages.filter(m => m.role !== "system")];
        return next;
    }
    checkpoint() {
        if (!this.persist || !this.messages.some(m => m.role === "user" && !m.contextKind))
            return;
        const id = randomUUID();
        this.store.save(`Vor Rewind · ${this.name || "Sitzung"}`.slice(0, 120), this.messages, this.model, this.project, id);
        return id;
    }
    rename(name) { this.name = cleanSessionName(name); this.save(); }
    list() { return this.store.list().filter(s => s.project === this.project); }
}
//# sourceMappingURL=session-controller.js.map