import type { PermissionMode } from "./permissions.js";
export type Decision = "allow" | "ask" | "deny";
export type Risk = "none" | "low" | "medium" | "high";
export interface PolicyVerdict {
    decision: Decision;
    risk: Risk;
    reason: string;
}
/**
 * Decide whether a tool action may run.
 *
 * Precedence:
 * 1. A matching disallowed pattern always denies.
 * 2. Plan mode denies every action that is not provably read-only.
 * 3. Strict mode asks for every action.
 * 4. A matching allowed pattern allows the action.
 * 5. The selected mode supplies the fail-closed default.
 */
export declare function decidePermission(toolName: string, argumentOrTarget: string, mode: PermissionMode, allowedPatterns?: readonly string[], disallowedPatterns?: readonly string[]): PolicyVerdict;
/**
 * Backward-compatible wrapper for callers using the old boolean policy API.
 * Its `strict` flag historically meant "gate mutations", not the named strict
 * mode, so it maps to `ask`; false maps to the conservative automatic mode.
 */
export declare function evaluateToolAction(tool: string, args: string, strict?: boolean): PolicyVerdict;
//# sourceMappingURL=policy-engine.d.ts.map