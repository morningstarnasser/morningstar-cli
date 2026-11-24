export interface ComposerState {
    value: string;
    cursor: number;
    anchor: number | null;
}
export declare function bounds(state: ComposerState): [number, number];
export declare function selectedText(state: ComposerState): string;
export declare function stepCursor(value: string, cursor: number, direction: -1 | 1): number;
export declare function wordCursor(value: string, cursor: number, direction: -1 | 1): number;
export declare function moveCursor(state: ComposerState, direction: -1 | 1, select?: boolean, word?: boolean): ComposerState;
export declare function replaceSelection(state: ComposerState, input: string): ComposerState;
export declare function erase(state: ComposerState, forward?: boolean): ComposerState;
/** Ink 5 conflates terminal DEL (Mac Backspace) and CSI 3~ (forward Delete). */
export declare function deletionKey(raw: string, key: {
    backspace: boolean;
    delete: boolean;
    ctrl: boolean;
    meta: boolean;
}, input: string): {
    forward: boolean;
    word: boolean;
    count: number;
} | null;
//# sourceMappingURL=composer.d.ts.map