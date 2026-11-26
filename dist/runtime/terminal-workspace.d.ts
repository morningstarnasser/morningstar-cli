import { DocumentLinks } from "./document-preview.js";
export interface WorkspaceData {
    scope: string;
    cwd: string;
    name: string;
    model: string;
    status: string;
    busy: boolean;
    blocked: boolean;
    conversation: string;
    agents: {
        id: string;
        name: string;
        status: string;
        detail: string;
    }[];
    sessions: () => {
        id: string;
        name: string;
        savedAt: string;
        messageCount: number;
    }[];
    resume: (id: string) => void;
}
export declare function fitCells(text: string, width: number): string;
/** A read-only navigator layered over the live terminal, not a second agent session. */
export declare class TerminalWorkspace {
    readonly links: DocumentLinks;
    private data;
    active: boolean;
    private tab;
    private selected;
    private selectedId;
    private offset;
    private listOffset;
    private focus;
    private document;
    private error;
    private loading;
    private generation;
    private controller?;
    private scope;
    private body;
    private documentRows?;
    private wrappedSource?;
    private wrappedWidth;
    private entries;
    private sessionList;
    private width;
    private height;
    private sidebar;
    private visibleBody;
    private navTop;
    private onChange;
    constructor(links: DocumentLinks, data: () => WorkspaceData | undefined, changed: () => void);
    private syncScope;
    open(): void;
    close(): void;
    openDocument(href: string): Promise<void>;
    private changeTab;
    private choose;
    input(input: string): Promise<void>;
    scroll(amount: number, x?: number): void;
    click(x: number, y: number): Promise<void>;
    private markdownRows;
    frame(columns: number, rows: number): string[];
}
//# sourceMappingURL=terminal-workspace.d.ts.map