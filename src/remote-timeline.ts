import type { ToolResult } from "./types.js";
import { displayText, fileChange, workHeading } from "./runtime/work-log.js";
export interface RemoteWork {
  agent: string; heading: string; success: boolean; output: string;
  change?: { added: number; removed: number; lines: { kind: string; text: string; line: number }[] };
}
export type RemoteTimelineEntry =
  | { id: string; kind: "message"; role: "user" | "assistant"; content: string }
  | { id: string; kind: "work"; work: RemoteWork }
  | { id: string; kind: "notice"; content: string };
interface Output { id: number; type: string; content?: string; streamingText?: string; toolResults?: ToolResult[]; toolLabel?: string }
/** Explicit allowlist: auth output, pairing secrets, reasoning and internal UI never leave the terminal. */
export function remoteTimeline(output: Output[]): RemoteTimelineEntry[] {
  return output.flatMap((item): RemoteTimelineEntry[] => {
    const id = String(item.id);
    if (item.type === "text" && item.content?.startsWith("> ")) return [{ id, kind: "message", role: "user", content: displayText(item.content.slice(2)).slice(0, 32000) }];
    if (item.type === "ai-response" && item.streamingText?.trim()) return [{ id, kind: "message", role: "assistant", content: displayText(item.streamingText).slice(0, 64000) }];
    if (item.type === "notice") return [{ id, kind: "notice", content: displayText(item.content ?? "").slice(0, 16000) }];
    if (item.type !== "work-log") return [];
    return (item.toolResults ?? []).map((r, index) => ({ id: `${id}:${index}`, kind: "work", work: { agent: item.toolLabel ?? "morningstar", heading: displayText(workHeading(r)), success: r.success, output: displayText(r.result).slice(0, 16000), change: r.diff ? fileChange(r.diff.oldStr, r.diff.newStr) : undefined } }));
  }).slice(-300);
}
