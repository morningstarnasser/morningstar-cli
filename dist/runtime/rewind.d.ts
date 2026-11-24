import type { Message } from "../types.js";
export type RewindAction = "restore" | "summarize-from" | "summarize-until";
export declare const rewindPoints: (messages: readonly Message[]) => {
    index: number;
    text: string;
}[];
export declare function rewindRange(messages: readonly Message[], index: number, action: RewindAction): {
    before: Message[];
    selected: Message[];
    after: Message[];
};
export declare function rewindConversation(messages: readonly Message[], index: number, action: RewindAction, summarize: (messages: Message[]) => Promise<string>): Promise<{
    messages: Message[];
    draft: string;
    images?: Message["images"];
}>;
//# sourceMappingURL=rewind.d.ts.map