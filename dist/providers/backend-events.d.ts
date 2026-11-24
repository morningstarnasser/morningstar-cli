import type { ToolResult } from "../types.js";
import type { StreamToken } from "../providers.js";
/** Observations from a provider's own runtime; never requests for re-execution. */
export interface BackendActivity {
    id: string;
    agent: string;
    label: string;
    status: "running" | "completed" | "failed";
    result?: ToolResult;
    notice?: string;
    agents?: {
        taskId: string;
        agentId: string;
        status: "pending" | "running" | "completed" | "failed" | "cancelled";
        detail: string;
        elapsedMs: number;
    }[];
}
export declare function parseBackendEvent(line: string): StreamToken | null;
//# sourceMappingURL=backend-events.d.ts.map