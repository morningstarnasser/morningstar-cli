import { saveConversation, loadConversation, listConversations, type SavedConversation } from "./history.js";
import type { Message } from "./types.js";
export declare const cleanSessionName: (name: string) => string;
export interface SessionStore {
    save: typeof saveConversation;
    load: typeof loadConversation;
    list: typeof listConversations;
}
/** Identity and history move together; clearing context never reuses an old ID. */
export declare class SessionController {
    project: string;
    model: string;
    id: string;
    name: string;
    messages: Message[];
    constructor(project: string, model: string, messages: Message[], options?: {
        id?: string;
        name?: string;
        persist?: boolean;
        store?: SessionStore;
    });
    private persist;
    private store;
    update(messages: Message[], model?: string): void;
    save(): SavedConversation | undefined;
    fresh(system: string, name?: string): void;
    resume(reference: string, system: string): SavedConversation;
    checkpoint(): string | undefined;
    rename(name: string): void;
    list(): {
        id: string;
        name: string;
        savedAt: string;
        messageCount: number;
        project: string;
    }[];
}
//# sourceMappingURL=session-controller.d.ts.map