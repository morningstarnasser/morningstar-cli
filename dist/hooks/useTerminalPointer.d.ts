import React, { type RefObject } from "react";
import { type DOMElement } from "ink";
export interface Pointer {
    x: number;
    y: number;
    kind: "down" | "move" | "up";
    shift: boolean;
}
/** Coordinates are relative to the actual cursor reported by the terminal,
 * so scrollback, short screens and static output do not move the hit targets. */
export declare function TerminalPointer({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function TerminalLiveFooter({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function TerminalDock({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useTerminalHit(node: RefObject<DOMElement>, handle: (event: Pointer) => void): void;
//# sourceMappingURL=useTerminalPointer.d.ts.map