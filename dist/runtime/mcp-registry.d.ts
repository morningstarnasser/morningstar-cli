import type { MCPTool, MCPToolCallResult } from "../mcp-client.js";
/** The slice of MCPClient the registry depends on (real client satisfies it). */
export interface MCPClientLike {
    connect(): Promise<void>;
    listTools(): Promise<MCPTool[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}
export type ServerStatus = "registered" | "connected" | "stopped" | "error";
export interface RegisteredServer {
    name: string;
    client: MCPClientLike;
    status: ServerStatus;
    tools: MCPTool[];
    error?: string;
}
/** A tool exposed under `server__tool`, carrying its owning server. */
export interface NamespacedTool extends MCPTool {
    server: string;
    qualifiedName: string;
}
/** Separator between server name and tool name in a qualified tool name. */
export declare const MCP_NAME_SEP = "__";
export declare function qualifyToolName(server: string, tool: string): string;
/** Split a qualified name at the FIRST separator (tool names may contain it). */
export declare function splitQualifiedName(qualified: string): {
    server: string;
    tool: string;
} | undefined;
export declare class MCPToolRegistry {
    private servers;
    /** Register a server's client (does not connect). Idempotent by name. */
    register(name: string, client: MCPClientLike): void;
    has(name: string): boolean;
    get(name: string): RegisteredServer | undefined;
    names(): string[];
    statuses(): Record<string, ServerStatus>;
    /** Connect a server and cache its tool list. On failure: status "error". */
    start(name: string): Promise<RegisteredServer>;
    /** Connect every registered server; returns each server's final state. */
    startAll(): Promise<RegisteredServer[]>;
    /** Disconnect a server (status "stopped"). No-op if unknown. */
    stop(name: string): Promise<void>;
    stopAll(): Promise<void>;
    /** Disconnect and remove a server. */
    unregister(name: string): Promise<boolean>;
    /** All tools across connected servers, each namespaced as `server__tool`. */
    listTools(): NamespacedTool[];
    /** Resolve a qualified tool name to its server + tool spec. */
    findTool(qualifiedName: string): {
        server: RegisteredServer;
        tool: MCPTool;
    } | undefined;
    /** Route a tool call (`server__tool`) to the owning server. */
    dispatch(qualifiedName: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
}
//# sourceMappingURL=mcp-registry.d.ts.map