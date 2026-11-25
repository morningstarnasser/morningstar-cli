import type { RemoteTimelineEntry } from "./remote-timeline.js";
export interface RemoteAction {
    type: "message" | "stop" | "approve" | "new" | "resume" | "rename";
    id: string;
    text?: string;
    sessionId?: string;
    approvalId?: string;
    allow?: boolean;
}
export interface RemoteSnapshot {
    revision?: number;
    id: string;
    name: string;
    model: string;
    project: string;
    busy: boolean;
    stream: string;
    messages: {
        role: string;
        content: string;
        isError?: boolean;
    }[];
    activity?: {
        label: string;
        status: string;
    }[];
    workCount?: number;
    timeline?: RemoteTimelineEntry[];
    agents: {
        taskId: string;
        agentId: string;
        status: string;
        detail: string;
        elapsedMs: number;
    }[];
    work: {
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
    }[];
    approval: {
        id: string;
        tool: string;
        target: string;
        reason: string;
    } | null;
}
export interface RemoteOptions {
    host?: string;
    port?: number;
    snapshot: () => RemoteSnapshot;
    sessions: () => {
        id: string;
        name: string;
        savedAt: string;
        messageCount: number;
    }[];
    action: (action: RemoteAction) => void | Promise<void>;
    now?: () => number;
}
export interface RemoteControl {
    url: string;
    host: string;
    port: number;
    running: boolean;
    pair: () => {
        url: string;
        expiresAt: number;
    };
    stop: () => Promise<void>;
}
export declare function privateAddress(host: string): boolean;
export declare function remoteAddress(mode?: string): {
    host: string;
    label: string;
};
export declare function remoteAction(raw: Record<string, unknown>): RemoteAction;
export declare function startRemoteControl(options: RemoteOptions): Promise<RemoteControl>;
//# sourceMappingURL=remote-control.d.ts.map