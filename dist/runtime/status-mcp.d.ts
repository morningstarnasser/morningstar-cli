export interface StatusTarget {
    label: string;
    url: string;
}
export type StatusTargets = Record<string, StatusTarget>;
/** URLs come only from an operator-owned file, never from tool arguments. */
export declare function parseStatusTargets(value: unknown): StatusTargets;
export declare function readEntityStatus(targets: StatusTargets, args: Record<string, unknown>): Promise<Record<string, unknown>>;
/** Small stdio MCP adapter for existing read-only JSON monitoring endpoints. */
export declare function serveStatusMCP(configPath?: string): Promise<void>;
//# sourceMappingURL=status-mcp.d.ts.map