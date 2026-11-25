import { type MCPServerConfig, type MCPTool, type MCPToolCallResult } from "./mcp-client.js";
import type { MorningstarSettings } from "./settings.js";
export declare const MCP_TOOL_PREFIX = "mcp__";
export interface ConnectedMCPTool extends MCPTool {
    serverName: string;
    qualifiedName: string;
}
export declare function subscribeMCPChanges(listener: () => void): () => void;
/** Provider-safe, deterministic namespace for one exact MCP server/tool pair. */
export declare function qualifyMCPToolName(serverName: string, toolName: string): string;
export declare function isMCPToolName(name: string): boolean;
/** Synchronous snapshot used when constructing provider-native tool schemas. */
export declare function getConnectedMCPTools(): ConnectedMCPTool[];
export declare function formatConnectedMCPToolsForPrompt(): string;
/** Old TUI transcripts embedded a catalog; replace only that generated section
 * in provider requests. Stored history and surrounding operator rules survive. */
export declare function stripGeneratedMCPPrompt(content: string): string;
/**
 * Get MCP server configurations from settings.
 */
export declare function getMCPServers(settings: MorningstarSettings): Record<string, MCPServerConfig>;
/** Only explicitly opted-in, trusted server configurations start automatically. */
export declare function connectConfiguredMCPServers(settings: MorningstarSettings): Promise<string[]>;
/**
 * Add an MCP server to settings.
 */
export declare function addMCPServer(name: string, config: MCPServerConfig): void;
/**
 * Remove an MCP server from settings.
 */
export declare function removeMCPServer(name: string): boolean;
/**
 * Connect to an MCP server.
 */
export declare function connectMCPServer(name: string, config: MCPServerConfig): Promise<MCPTool[]>;
/**
 * Disconnect an MCP server.
 */
export declare function disconnectMCPServer(name: string): Promise<void>;
/**
 * Disconnect all MCP servers.
 */
export declare function disconnectAllMCPServers(): Promise<void>;
export declare function serializeMCPToolResult(response: MCPToolCallResult): string;
/** Dispatch one provider-qualified MCP call to its exact connected owner. */
export declare function callQualifiedMCPTool(qualifiedName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<{
    success: boolean;
    result: string;
    serverName: string;
}>;
/**
 * Get all available MCP tools across all connected servers.
 */
export declare function getAllMCPTools(): Promise<ConnectedMCPTool[]>;
/**
 * Check if an MCP server is connected.
 */
export declare function isMCPServerConnected(name: string): boolean;
/**
 * Format MCP servers display for /mcp command.
 */
export declare function formatMCPDisplay(settings: MorningstarSettings): string;
//# sourceMappingURL=mcp.d.ts.map