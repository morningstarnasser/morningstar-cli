export type PermissionMode = "auto" | "ask" | "strict" | "bypassPermissions" | "acceptEdits" | "plan" | "dontAsk" | "delegate";
export type ToolCategory = "safe" | "moderate" | "dangerous";
export declare function isValidPermissionMode(mode: string): mode is PermissionMode;
export declare function getToolCategory(tool: string): ToolCategory;
export declare function shouldAskPermission(tool: string, mode: PermissionMode, allowList?: string[]): boolean;
/**
 * For "dontAsk" mode: check if tool should be denied (not in allow list)
 */
export declare function shouldDenyInDontAskMode(tool: string, allowList?: string[]): boolean;
export declare function getPermissionMode(): PermissionMode;
export declare function setPermissionMode(mode: PermissionMode): void;
export declare function formatPermissionPrompt(tool: string, args: string): string;
export declare function getCategoryColor(cat: ToolCategory): string;
export declare function getPermissionModeDescription(mode: PermissionMode): string;
//# sourceMappingURL=permissions.d.ts.map