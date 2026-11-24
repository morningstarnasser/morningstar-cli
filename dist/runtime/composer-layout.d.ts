export interface ComposerCell {
    text: string;
    index: number;
    end: number;
    x: number;
    width: number;
    prefix?: boolean;
}
export declare function composerLayout(value: string, prefix: string, width: number): ComposerCell[][];
export declare function composerOffset(rows: ComposerCell[][], x: number, y: number): number;
/** Ink strips the initial escape from input before delivering useInput. */
export declare const terminalReport: (input: string) => boolean;
//# sourceMappingURL=composer-layout.d.ts.map