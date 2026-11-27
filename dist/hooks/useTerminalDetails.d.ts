export interface TerminalDetail {
    title: string;
    body: string;
}
export declare const TerminalDetails: import("react").Context<Map<string, TerminalDetail> | null>;
/** Static Ink rows disappear from React's hit tree, so keep their captured detail
 * behind a stable printed marker that the terminal scrollback can resolve. */
export declare function useTerminalDetail(detail: TerminalDetail, omittedLines?: number): string | null;
//# sourceMappingURL=useTerminalDetails.d.ts.map