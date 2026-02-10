export type PermissionMode = "auto" | "ask" | "strict";
export type ToolCategory = "safe" | "moderate" | "dangerous";
export declare function getToolCategory(tool: string): ToolCategory;
export declare function shouldAskPermission(tool: string, mode: PermissionMode): boolean;
export declare function getPermissionMode(): PermissionMode;
export declare function setPermissionMode(mode: PermissionMode): void;
export declare function formatPermissionPrompt(tool: string, args: string): string;
export declare function getCategoryColor(cat: ToolCategory): string;
//# sourceMappingURL=permissions.d.ts.map