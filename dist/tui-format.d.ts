export interface HudState {
    model: string;
    cwd?: string;
    tokens?: number;
    costUsd?: number;
    turn?: number;
}
/** A one-line status HUD. Keeps only the basename of cwd for width. */
export declare function formatHud(s: HudState): string;
/**
 * Collapse output longer than `maxLines` to the first and last lines with a
 * "… N lines hidden …" marker. Short output is returned unchanged.
 */
export declare function collapseOutput(text: string, maxLines?: number, headTail?: number): string;
/** Split text into pages of at most `pageSize` chars, breaking on line boundaries. */
export declare function paginate(text: string, pageSize?: number): string[];
//# sourceMappingURL=tui-format.d.ts.map