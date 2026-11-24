import type { ToolResult } from "../types.js";
import type { StreamToken } from "../providers.js";

/** Observations from a provider's own runtime; never requests for re-execution. */
export interface BackendActivity {
  id: string; agent: string; label: string;
  status: "running" | "completed" | "failed";
  result?: ToolResult;
  notice?: string;
  agents?: { taskId: string; agentId: string; status: "pending" | "running" | "completed" | "failed" | "cancelled"; detail: string; elapsedMs: number }[];
}
const object = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const text = (v: unknown, limit = 32000): string => typeof v === "string" ? v.slice(0, limit) : "";
export function parseBackendEvent(line: string): StreamToken | null {
  let e: Record<string, any>;
  try { e = object(JSON.parse(line)); } catch { return null; }
  if (e.type === "turn.failed" || e.type === "error") throw new Error(text(e.error?.message ?? e.message) || "Codex-Lauf fehlgeschlagen");
  if (e.type === "turn.completed" && e.usage) {
    const u = object(e.usage), inputTokens = Number(u.input_tokens) || 0, outputTokens = Number(u.output_tokens) || 0;
    return { type: "usage", text: "", usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, cacheHitTokens: Number(u.cached_input_tokens) || 0 } };
  }
  if (!["item.started", "item.updated", "item.completed"].includes(e.type)) return null;
  const i = object(e.item), done = e.type === "item.completed", failed = ["failed", "declined"].includes(i.status) || i.type === "error" || (typeof i.exit_code === "number" && i.exit_code !== 0);
  if (i.type === "agent_message") return done && typeof i.text === "string" ? { type: "content", text: i.text } : null;
  if (i.type === "reasoning") return null;
  const a: BackendActivity = { id: text(i.id, 200), agent: "codex", label: "", status: done ? failed ? "failed" : "completed" : "running" };
  let tool = i.type, output = "", command: string | undefined;
  switch (i.type) {
    case "command_execution": tool = "bash"; command = text(i.command); a.label = command; output = text(i.aggregated_output); break;
    case "mcp_tool_call":
      tool = `${text(i.server, 100)}.${text(i.tool, 150)}`; a.label = tool;
      output = text(i.error?.message) || (Array.isArray(i.result?.content) ? i.result.content.filter((c: any) => c?.type === "text").map((c: any) => text(c.text)).join("\n").slice(0, 32000) : ""); break;
    case "file_change":
      a.label = "Dateiänderungen";
      output = (Array.isArray(i.changes) ? i.changes : []).map((c: any) => `${text(c.kind, 20)} ${text(c.path, 1000)}`).join("\n"); break;
    case "web_search": a.label = `Suche · ${text(i.query, 300)}`; output = text(i.query); break;
    case "error":
      // Codex item.error is a non-fatal diagnostic. Fatal errors arrive as
      // error/turn.failed above; neither is disguised as a successful tool.
      return done ? { type: "backend_activity", text: "", activity: { ...a, label: "Codex-Hinweis", status: "completed", notice: text(i.message) } } : null;
    case "todo_list":
      a.label = "Arbeitsplan"; output = (Array.isArray(i.items) ? i.items : []).map((t: any) => `${t.completed ? "✓" : "○"} ${text(t.text, 500)}`).join("\n"); break;
    case "collab_tool_call": {
      a.label = `Swarm · ${text(i.tool, 80)}`;
      const states = object(i.agents_states);
      const ids = new Set<string>([...(Array.isArray(i.receiver_thread_ids) ? i.receiver_thread_ids.filter((id: unknown) => typeof id === "string") : []), ...Object.keys(states)]);
      a.agents = [...ids].slice(0, 50).map(id => {
        const s = object(states[id]);
        const status = s.status === "completed" ? "completed" : ["errored", "not_found"].includes(s.status) ? "failed" : ["interrupted", "shutdown"].includes(s.status) ? "cancelled" : s.status === "pending_init" ? "pending" : "running";
        return { taskId: id, agentId: `Codex ${id.slice(0, 8)}`, status, detail: text(s.message || i.prompt, 4000), elapsedMs: 0 };
      });
      output = a.agents.map(b => `${b.agentId} · ${b.status}\n${b.detail}`).join("\n"); break;
    }
    default: return null;
  }
  if (done) a.result = { tool, result: output, success: !failed, command, exitCode: typeof i.exit_code === "number" ? i.exit_code : undefined };
  return { type: "backend_activity", text: "", activity: a };
}
