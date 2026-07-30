export interface CommandDecision {
    allow: boolean;
    reason?: string;
}
export type CommandGuard = (cmd: string) => CommandDecision;
/** Install (or clear with null) the command guard. */
export declare function setCommandGuard(g: CommandGuard | null): void;
/** Consulted by bash() before executing. No guard installed → allow. */
export declare function checkCommand(cmd: string): CommandDecision;
export interface Classification {
    destructive: boolean;
    reason: string;
}
/** Classify a shell command. Pure + heavily tested. */
export declare function classifyCommand(cmd: string): Classification;
/** True if the command only reads/inspects (no mutation). Conservative. */
export declare function isReadOnlyCommand(cmd: string): boolean;
//# sourceMappingURL=safety.d.ts.map