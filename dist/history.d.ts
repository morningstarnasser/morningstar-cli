import type { Message } from "./types.js";
export interface SavedConversation {
    id: string;
    name: string;
    messages: Message[];
    model: string;
    project: string;
    savedAt: string;
    messageCount: number;
}
/**
 * Resolve what the user typed to a stored id.
 *
 * Sessions are saved under a *name* but addressed by *id*, so `/history load
 * allgemein` has to work as well as `/history load ms70ygx68aek`. Order, most
 * precise first: exact id, exact name (case-insensitive), unique id prefix,
 * unique partial name. Ambiguity resolves to nothing rather than a guess.
 */
export declare function resolveConversationId(reference: string): string | null;
/**
 * Persist a conversation. Passing `existingId` overwrites that session instead
 * of creating a copy, which is what renaming an open session must do.
 */
export declare function saveConversation(name: string, messages: Message[], model: string, project: string, existingId?: string): SavedConversation;
/** Load by id or by name. Returns null when nothing matches unambiguously. */
export declare function loadConversation(reference: string): SavedConversation | null;
export declare function listConversations(): Array<{
    id: string;
    name: string;
    savedAt: string;
    messageCount: number;
    project: string;
}>;
/** Delete by id or by name, with the same resolution rules as loading. */
export declare function deleteConversation(reference: string): boolean;
export declare function getLastConversation(project?: string): SavedConversation | null;
export declare function autoSave(messages: Message[], projectName: string, model: string): void;
export declare function getLastAutoSave(projectName: string): SavedConversation | null;
//# sourceMappingURL=history.d.ts.map