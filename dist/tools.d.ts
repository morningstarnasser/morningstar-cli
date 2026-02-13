import type { ToolResult } from "./types.js";
export declare const toolStats: {
    calls: number;
    byTool: Record<string, number>;
    filesRead: number;
    filesWritten: number;
    filesEdited: number;
    filesDeleted: number;
    bashCommands: number;
};
export declare function readFile(filePath: string, cwd: string): ToolResult;
export declare function writeFile(filePath: string, content: string, cwd: string): ToolResult;
export declare function editFile(filePath: string, oldStr: string, newStr: string, cwd: string): ToolResult;
export declare function deleteFile(filePath: string, cwd: string): ToolResult;
export declare function bash(command: string, cwd: string): ToolResult;
export declare function grepSearch(pattern: string, cwd: string, fileGlob?: string): ToolResult;
export declare function globSearch(pattern: string, cwd: string): Promise<ToolResult>;
export declare function listDir(dirPath: string, cwd: string): ToolResult;
export declare function webSearch(query: string): Promise<ToolResult>;
export declare function fetchUrl(url: string): Promise<ToolResult>;
export declare function ghCli(command: string, cwd: string): ToolResult;
export declare function gitStatus(cwd: string): ToolResult;
export declare function executeToolCalls(response: string, cwd: string): Promise<{
    results: ToolResult[];
    cleanResponse: string;
}>;
export declare function executeNativeToolCall(name: string, args: Record<string, unknown>, cwd: string): ToolResult | Promise<ToolResult>;
export interface NativeToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}
export declare function executeNativeToolCallsParallel(calls: NativeToolCall[], cwd: string): Promise<ToolResult[]>;
//# sourceMappingURL=tools.d.ts.map