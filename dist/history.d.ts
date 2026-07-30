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
export declare function saveConversation(name: string, messages: Message[], model: string, project: string): SavedConversation;
export declare function loadConversation(id: string): SavedConversation | null;
export declare function listConversations(): Array<{
    id: string;
    name: string;
    savedAt: string;
    messageCount: number;
    project: string;
}>;
export declare function deleteConversation(id: string): boolean;
export declare function getLastConversation(): SavedConversation | null;
export declare function autoSave(messages: Message[], projectName: string, model: string): void;
export declare function getLastAutoSave(projectName: string): SavedConversation | null;
//# sourceMappingURL=history.d.ts.map