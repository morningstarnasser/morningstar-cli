export interface SearchPoint {
    row: number;
    column: number;
}
export interface SearchMatch {
    start: SearchPoint;
    end: SearchPoint;
}
interface SearchLine {
    wrapped: boolean;
    cells: Array<{
        text: string;
        width: number;
    }>;
}
/** Literal, case-insensitive search over terminal cells, joining only soft wraps. */
export declare function findTerminalMatches(lines: SearchLine[], query: string): SearchMatch[];
/** Ctrl+F, or Super/Cmd+F when a terminal forwards CSI-u / modifyOtherKeys. */
export declare function isFindShortcut(input: string): boolean;
export {};
//# sourceMappingURL=terminal-search.d.ts.map