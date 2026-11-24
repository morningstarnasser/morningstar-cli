import type { AgentLifecycleEvent, ToolInvocation } from "../agent-runner.js";
export interface ActivityEntry {
    id: string;
    agent: string;
    label: string;
    status: "running" | "waiting" | "completed" | "failed" | "cancelled";
    startedAt: number;
    duration?: number;
}
export declare function activityLabel(invocation: ToolInvocation): string;
/** A factual tool timeline. Never records reasoning, file contents or tool payloads. */
export declare function updateActivity(entries: ActivityEntry[], agent: string, event: AgentLifecycleEvent, now?: number): ActivityEntry[];
//# sourceMappingURL=activity.d.ts.map