import xterm from "@xterm/headless";
export interface ViewportOptions {
    columns: number;
    rows: number;
    write: (data: string) => void;
    copy?: (text: string) => Promise<void>;
    scrollback?: number;
    detail?: (id: string) => {
        title: string;
        body: string;
    } | undefined;
    dockHeight?: () => number;
    liveHeight?: () => number;
}
/** Mirrors actual terminal output. Read mode freezes a snapshot while Ink keeps working. */
export declare class TerminalViewport {
    private options;
    readonly terminal: xterm.Terminal;
    private snapshot;
    private paintedRows;
    private top;
    private anchor;
    private end;
    private dragging;
    private notice;
    private detailTitle;
    private pendingUpdates;
    private footerTimer;
    private disposed;
    searching: boolean;
    private searchQuery;
    private searchMatches;
    private searchIndex;
    active: boolean;
    constructor(options: ViewportOptions);
    feed(data: string | Uint8Array): void;
    flush(): Promise<void>;
    private lines;
    /** Project the dynamic Ink region against the bottom without adding padding
     * to Ink's Static history. A completed/shorter response must not lift input. */
    private liveFrame;
    renderLive(): Promise<void>;
    /** Align the first short frame if Morningstar started below an existing shell prompt. */
    alignCursor(row: number): Promise<void>;
    enter(): Promise<void>;
    scroll(amount: number): Promise<void>;
    page(direction: number): Promise<void>;
    get modal(): boolean;
    private get pinnedHeight();
    isLiveRow(y: number): boolean;
    home(): Promise<void>;
    find(query?: string): Promise<void>;
    private updateSearch;
    private showSearchMatch;
    searchInput(input: string): Promise<void>;
    leave(): Promise<void>;
    private point;
    private openClickedDetail;
    pointer(kind: "down" | "move" | "up", x: number, y: number): Promise<void>;
    private bounds;
    selectedText(): string;
    copy(): Promise<void>;
    private frame;
    private footer;
    paint(): void;
    resize(columns: number, rows: number): void;
    dispose(): void;
}
//# sourceMappingURL=terminal-viewport.d.ts.map