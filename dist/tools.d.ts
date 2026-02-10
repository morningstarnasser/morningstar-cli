import type { ToolResult } from "./types.js";
export declare function readFile(filePath: string, cwd: string): ToolResult;
export declare function writeFile(filePath: string, content: string, cwd: string): ToolResult;
export declare function editFile(filePath: string, oldStr: string, newStr: string, cwd: string): ToolResult;
export declare function deleteFile(filePath: string, cwd: string): ToolResult;
export declare function bash(command: string, cwd: string): ToolResult;
export declare function grepSearch(pattern: string, cwd: string, fileGlob?: string): ToolResult;
export declare function globSearch(pattern: string, cwd: string): Promise<ToolResult>;
export declare function listDir(dirPath: string, cwd: string): ToolResult;
export declare function gitStatus(cwd: string): ToolResult;
export declare function executeToolCalls(response: string, cwd: string): Promise<{
    results: ToolResult[];
    cleanResponse: string;
}>;
//# sourceMappingURL=tools.d.ts.map