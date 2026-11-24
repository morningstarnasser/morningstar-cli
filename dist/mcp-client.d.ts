/**
 * MCP children get a minimal runtime environment. Provider/API credentials are
 * inherited only when the user explicitly places them in the server config.
 */
export declare function buildMCPEnvironment(explicit?: Record<string, string>, source?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export interface MCPServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    /** Explicit opt-in from trusted settings; project files cannot grant this. */
    autoConnect?: boolean;
}
export interface MCPTool {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
}
export interface MCPToolCallResult {
    content: Array<{
        type: string;
        text?: string;
        data?: string;
        mimeType?: string;
        uri?: string;
        name?: string;
        description?: string;
        resource?: {
            uri: string;
            mimeType?: string;
            text?: string;
            blob?: string;
        };
        [key: string]: unknown;
    }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
}
export declare class MCPClient {
    private config;
    private onClosed?;
    private onToolsChanged?;
    private process;
    private nextId;
    private pending;
    private buffer;
    private initialized;
    private connectionGeneration;
    private lastClosedGeneration;
    constructor(config: MCPServerConfig, onClosed?: (() => void) | undefined, onToolsChanged?: (() => void) | undefined);
    connect(): Promise<void>;
    private rejectPending;
    private ownsConnection;
    private closeCurrentConnection;
    private notifyClosed;
    private processBuffer;
    private sendRequest;
    private sendNotification;
    listTools(): Promise<MCPTool[]>;
    callTool(name: string, arguments_: Record<string, unknown>, signal?: AbortSignal): Promise<MCPToolCallResult>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}
//# sourceMappingURL=mcp-client.d.ts.map