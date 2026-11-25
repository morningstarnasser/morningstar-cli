export interface StatusTarget {
    label: string;
    url: string;
}
export type StatusTargets = Record<string, StatusTarget>;
/** Derived display values use the endpoint's explicit units. Keep raw data intact
 * so the model can cite measurements without mentally converting large numbers. */
export declare function statusDisplay(data: Record<string, unknown>): Record<string, string | number>;
/** URLs come only from an operator-owned file, never from tool arguments. */
export declare function parseStatusTargets(value: unknown): StatusTargets;
export declare function readEntityStatus(targets: StatusTargets, args: Record<string, unknown>): Promise<Record<string, unknown>>;
/** Small stdio MCP adapter for existing read-only JSON monitoring endpoints. */
export declare function serveStatusMCP(configPath?: string): Promise<void>;
//# sourceMappingURL=status-mcp.d.ts.map