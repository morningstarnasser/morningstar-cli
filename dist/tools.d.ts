import { type IncomingHttpHeaders } from "node:http";
import type { ToolResult } from "./types.js";
export declare function setAgentToolFilter(tools: string[] | null | undefined): void;
export declare function isToolAllowedForAgent(toolName: string): boolean;
export declare function getAgentToolFilter(): string[] | null;
export declare function getBackgroundTaskStatus(taskId: string): ToolResult;
export declare function listBackgroundTasks(): ToolResult;
export declare const toolStats: {
    calls: number;
    byTool: Record<string, number>;
    filesRead: number;
    filesWritten: number;
    filesEdited: number;
    filesDeleted: number;
    bashCommands: number;
};
export declare function readFile(filePath: string, cwd: string, offset?: number, limit?: number): ToolResult;
export declare function writeFile(filePath: string, content: string, cwd: string): ToolResult;
export declare function editFile(filePath: string, oldStr: string, newStr: string, cwd: string, replaceAll?: boolean): ToolResult;
export declare function deleteFile(filePath: string, cwd: string): ToolResult;
export declare function bash(command: string, cwd: string, timeout?: number, runInBackground?: boolean, signal?: AbortSignal): Promise<ToolResult>;
export declare function grepSearch(pattern: string, cwd: string, fileGlob?: string, contextBefore?: number, contextAfter?: number, context?: number, caseSensitive?: boolean, maxResults?: number): ToolResult;
export declare function globSearch(pattern: string, cwd: string): Promise<ToolResult>;
export declare function listDir(dirPath: string, cwd: string): ToolResult;
export declare function webSearch(query: string, signal?: AbortSignal): Promise<ToolResult>;
export interface FetchAddress {
    address: string;
    family: 4 | 6;
}
export type FetchAddressLookup = (hostname: string) => Promise<readonly FetchAddress[]>;
export interface FetchHopResponse {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: string;
}
export type FetchHopRequester = (url: URL, address: FetchAddress, signal: AbortSignal) => Promise<FetchHopResponse>;
export interface FetchUrlOptions {
    lookup?: FetchAddressLookup;
    request?: FetchHopRequester;
    maxRedirects?: number;
}
/** True for loopback, private, link-local, multicast, and reserved IP space. */
export declare function isBlockedFetchAddress(address: string): boolean;
export declare function resolvePublicFetchTarget(rawUrl: string, lookup?: FetchAddressLookup): Promise<{
    ok: true;
    url: URL;
    address: FetchAddress;
} | {
    ok: false;
    reason: string;
}>;
export declare function fetchUrl(url: string, signal?: AbortSignal, options?: FetchUrlOptions): Promise<ToolResult>;
/**
 * Split a command-like string into argv without invoking a shell.
 *
 * Quotes and backslash escapes are supported only for grouping/literal
 * characters. Variables, substitutions, redirects, pipes, and separators are
 * never interpreted because the resulting argv is passed straight to `gh`.
 */
export declare function parseCommandArguments(input: string): string[] | null;
export declare function ghCli(command: string, cwd: string): ToolResult;
export declare function gitStatus(cwd: string): ToolResult;
export declare function notebookEdit(notebookPath: string, cellNumber: number, editMode: "replace" | "insert" | "delete", cwd: string, cellType?: "code" | "markdown", newSource?: string): ToolResult;
/** Opt-in gate for executing plain ```bash/```python blocks found in ordinary model prose. */
export declare function autoExecuteEnabled(): boolean;
export interface ParsedToolCall {
    /** Normalized, lower-case tool name used for authorization decisions. */
    tool: string;
    /** Tool-specific normalized arguments (the same shape used by native calls). */
    args: Record<string, unknown>;
    /** Exact source fragment that produced this call. */
    raw?: string;
    source?: {
        index: number;
        kind: "tag" | "unclosed" | "auto";
    };
    /** A syntactically recognized call whose arguments could not be normalized. */
    error?: string;
}
export interface ParsedToolCallBatch {
    calls: ParsedToolCall[];
    cleanResponse: string;
}
/**
 * Parse and normalize every text-based call that the legacy executor would
 * consider. This function has no execution side effects, so callers can inspect
 * and authorize `calls` before passing each one to `executeToolCall`.
 */
export declare function parseToolCalls(response: string): ParsedToolCallBatch;
/**
 * Execute one previously parsed and authorized text tool call.
 */
export declare function executeToolCall(call: ParsedToolCall, cwd: string, signal?: AbortSignal): Promise<ToolResult>;
/**
 * Backwards-compatible parse-and-execute API. New authorization-aware callers
 * should use `parseToolCalls`, decide per call, then invoke `executeToolCall`.
 */
export declare function executeToolCalls(response: string, cwd: string): Promise<{
    results: ToolResult[];
    cleanResponse: string;
}>;
export declare function executeNativeToolCall(name: string, args: Record<string, unknown>, cwd: string, signal?: AbortSignal): ToolResult | Promise<ToolResult>;
export declare function isNativeToolParallelSafe(toolName: string): boolean;
export interface NativeToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}
export declare function executeNativeToolCallsParallel(calls: NativeToolCall[], cwd: string): Promise<ToolResult[]>;
//# sourceMappingURL=tools.d.ts.map