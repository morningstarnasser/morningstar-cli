/** Unstyled cells let Ink own ANSI boundaries, including padding and line clearing. */
export declare function qrRows(url: string): {
    top: boolean;
    bottom: boolean;
}[][];
/** Four-module quiet zone and explicit black/white colors survive dark themes. */
export declare function terminalQR(url: string): string;
//# sourceMappingURL=terminal-qr.d.ts.map