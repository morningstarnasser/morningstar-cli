export interface MCPServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
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
    }>;
    isError?: boolean;
}
export declare class MCPClient {
    private config;
    private process;
    private nextId;
    private pending;
    private buffer;
    private initialized;
    constructor(config: MCPServerConfig);
    connect(): Promise<void>;
    private processBuffer;
    private sendRequest;
    private sendNotification;
    listTools(): Promise<MCPTool[]>;
    callTool(name: string, arguments_: Record<string, unknown>): Promise<MCPToolCallResult>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}
//# sourceMappingURL=mcp-client.d.ts.map