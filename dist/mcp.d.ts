import { type MCPServerConfig, type MCPTool } from "./mcp-client.js";
import type { MorningstarSettings } from "./settings.js";
/**
 * Get MCP server configurations from settings.
 */
export declare function getMCPServers(settings: MorningstarSettings): Record<string, MCPServerConfig>;
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
/**
 * Call an MCP tool by name.
 * Searches all connected servers for the tool.
 */
export declare function callMCPTool(toolName: string, args: Record<string, unknown>): Promise<{
    success: boolean;
    result: string;
    serverName: string;
}>;
/**
 * Get all available MCP tools across all connected servers.
 */
export declare function getAllMCPTools(): Promise<Array<MCPTool & {
    serverName: string;
}>>;
/**
 * Check if an MCP server is connected.
 */
export declare function isMCPServerConnected(name: string): boolean;
/**
 * Format MCP servers display for /mcp command.
 */
export declare function formatMCPDisplay(settings: MorningstarSettings): string;
//# sourceMappingURL=mcp.d.ts.map