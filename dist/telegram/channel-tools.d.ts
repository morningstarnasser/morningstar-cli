import type { OpenAIToolDefinition } from "../tool-definitions.js";
import type { ToolResult } from "../types.js";
type Handler = (name: string, args: Record<string, unknown>, cwd: string) => Promise<ToolResult>;
export declare const isTelegramTool: (name: string) => boolean;
export declare function registerTelegramTools(handler: Handler): () => void;
export declare function executeTelegramTool(name: string, args: Record<string, unknown>, cwd: string): Promise<ToolResult>;
export declare function getTelegramToolDefinitions(): OpenAIToolDefinition[];
export {};
//# sourceMappingURL=channel-tools.d.ts.map