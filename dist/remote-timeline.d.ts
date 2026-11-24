import type { ToolResult } from "./types.js";
export interface RemoteWork {
    agent: string;
    heading: string;
    success: boolean;
    output: string;
    change?: {
        added: number;
        removed: number;
        lines: {
            kind: string;
            text: string;
            line: number;
        }[];
    };
}
export type RemoteTimelineEntry = {
    id: string;
    kind: "message";
    role: "user" | "assistant";
    content: string;
} | {
    id: string;
    kind: "work";
    work: RemoteWork;
} | {
    id: string;
    kind: "notice";
    content: string;
};
interface Output {
    id: number;
    type: string;
    content?: string;
    streamingText?: string;
    toolResults?: ToolResult[];
    toolLabel?: string;
}
/** Explicit allowlist: auth output, pairing secrets, reasoning and internal UI never leave the terminal. */
export declare function remoteTimeline(output: Output[]): RemoteTimelineEntry[];
export {};
//# sourceMappingURL=remote-timeline.d.ts.map