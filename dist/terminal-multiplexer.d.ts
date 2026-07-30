export interface Pane {
    id: string;
    type: "chat" | "code-preview" | "tools" | "diff" | "terminal" | "custom";
    title: string;
    width: number;
    height: number;
    visible: boolean;
    content: string;
    scrollOffset: number;
}
export interface Layout {
    id: string;
    name: string;
    panes: Pane[];
    arrangement: "horizontal" | "vertical" | "grid";
}
export interface MultiplexerState {
    layout: Layout;
    termWidth: number;
    termHeight: number;
    focusedPane: string;
    paneContents: Map<string, string>;
}
export interface PanePosition {
    id: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    focused: boolean;
}
export interface BorderFrame {
    lines: string[];
    width: number;
    height: number;
}
export declare function getAvailableLayouts(): Layout[];
export declare function getLayout(id: string): Layout | null;
export declare function createMultiplexer(termWidth: number, termHeight: number): MultiplexerState;
export declare function setLayout(mux: MultiplexerState, layoutId: string): MultiplexerState;
export declare function resizePane(mux: MultiplexerState, paneId: string, delta: {
    width?: number;
    height?: number;
}): MultiplexerState;
export declare function togglePane(mux: MultiplexerState, paneId: string): MultiplexerState;
export declare function updatePaneContent(mux: MultiplexerState, paneId: string, content: string): MultiplexerState;
export declare function scrollPane(mux: MultiplexerState, paneId: string, lines: number): MultiplexerState;
export declare function focusPane(mux: MultiplexerState, paneId: string): MultiplexerState;
export declare function focusNext(mux: MultiplexerState): MultiplexerState;
export declare function calculatePanePositions(mux: MultiplexerState): PanePosition[];
export declare function renderBorders(positions: PanePosition[], termWidth: number, termHeight: number): BorderFrame;
export declare function fitContentToPane(content: string, width: number, height: number, scrollOffset: number): string[];
export declare function formatLayoutList(): string;
export declare function formatPaneList(mux: MultiplexerState): string;
export declare function formatStatusLine(mux: MultiplexerState): string;
//# sourceMappingURL=terminal-multiplexer.d.ts.map