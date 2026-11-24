import type { AgentLifecycleEvent, ToolInvocation } from "../agent-runner.js";
export interface ActivityEntry {
  id: string; agent: string; label: string;
  status: "running" | "waiting" | "completed" | "failed" | "cancelled";
  startedAt: number; duration?: number;
}
export function activityLabel(invocation: ToolInvocation): string {
  const args = invocation.args;
  const target = args.filePath ?? args.notebookPath ?? args.dirPath ?? args.pattern ?? args.command ?? args.query ?? args.url ?? args.title ?? "";
  return `${invocation.name}${target ? ` · ${String(target).replace(/[\r\n\t\x00-\x1f]/g, " ").slice(0, 160)}` : ""}`;
}
/** A factual tool timeline. Never records reasoning, file contents or tool payloads. */
export function updateActivity(entries: ActivityEntry[], agent: string, event: AgentLifecycleEvent, now = Date.now()): ActivityEntry[] {
  if (event.type === "tool_requested") {
    return [...entries, { id: `${agent}:${event.invocation.id}`, agent, label: activityLabel(event.invocation), status: "running" as const, startedAt: now }].slice(-200);
  }
  if (event.type === "approval_required") {
    return entries.map(e => e.id === `${agent}:${event.request.invocation.id}` ? { ...e, status: "waiting" } : e);
  }
  if (event.type === "approval_decision") {
    return entries.map(e => e.id === `${agent}:${event.decision.invocation.id}` ? { ...e, status: event.decision.decision === "allow" ? "running" : "failed" } : e);
  }
  if (event.type === "tool_result") {
    return entries.map(e => e.id === `${agent}:${event.invocation.id}` ? { ...e, status: event.result.success ? "completed" : "failed", duration: now - e.startedAt } : e);
  }
  if (event.type === "completion") {
    return entries.map(e => e.agent === agent && (e.status === "running" || e.status === "waiting") ? { ...e, status: event.result.aborted ? "cancelled" : "failed", duration: now - e.startedAt } : e);
  }
  return entries;
}
