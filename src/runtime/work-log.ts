import { stripVTControlCharacters } from "node:util";
import type { ToolInvocation } from "../agent-runner.js";
import type { ToolResult } from "../types.js";

export function displayText(text: string): string {
  return stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

export interface ChangeLine { kind: "context" | "added" | "removed"; text: string; line: number }
export interface FileChange { added: number; removed: number; lines: ChangeLine[]; omitted: number; coarse: boolean }
const splitLines = (s: string) => s ? s.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n") : [];

/** Bounded LCS with common edges removed; huge replacements use a valid coarse diff. */
export function fileChange(before: string, after: string, startLine = 1, previewLimit = 28): FileChange {
  const old = splitLines(before), next = splitLines(after);
  let prefix = 0, suffix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
  while (suffix < old.length - prefix && suffix < next.length - prefix && old[old.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  const a = old.slice(prefix, old.length - suffix), b = next.slice(prefix, next.length - suffix);
  const coarse = a.length * b.length > 250000;
  const middle: ChangeLine[] = [];
  if (coarse || !a.length || !b.length) {
    a.forEach((text, i) => middle.push({ kind: "removed", text, line: startLine + prefix + i }));
    b.forEach((text, i) => middle.push({ kind: "added", text, line: startLine + prefix + i }));
  } else {
    const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    let i = a.length, j = b.length;
    while (i || j) {
      if (i && j && a[i - 1] === b[j - 1]) { middle.push({ kind: "context", text: a[i - 1], line: startLine + prefix + j - 1 }); i--; j--; }
      else if (j && (!i || table[i][j - 1] >= table[i - 1][j])) { middle.push({ kind: "added", text: b[j - 1], line: startLine + prefix + j - 1 }); j--; }
      else { middle.push({ kind: "removed", text: a[i - 1], line: startLine + prefix + i - 1 }); i--; }
    }
    middle.reverse();
  }
  const added = middle.filter(l => l.kind === "added").length, removed = middle.filter(l => l.kind === "removed").length;
  if (!added && !removed) return { added, removed, lines: [], omitted: 0, coarse };
  const all: ChangeLine[] = [
    ...old.slice(Math.max(0, prefix - 2), prefix).map((text, i) => ({ kind: "context" as const, text, line: startLine + Math.max(0, prefix - 2) + i })),
    ...middle,
    ...next.slice(next.length - suffix, next.length - suffix + Math.min(suffix, 2)).map((text, i) => ({ kind: "context" as const, text, line: startLine + next.length - suffix + i })),
  ];
  // Keep changed lines and their nearby context, not thousands of untouched lines.
  const indices = new Set<number>();
  all.forEach((line, index) => { if (line.kind !== "context") for (let i = Math.max(0, index - 2); i <= Math.min(all.length - 1, index + 2); i++) indices.add(i); });
  const visible = [...indices].sort((x, y) => x - y).map(i => all[i]);
  return { added, removed, lines: visible.slice(0, previewLimit), omitted: Math.max(0, visible.length - previewLimit), coarse };
}

/** Attach invocation metadata even when a policy denial never reached the executor. */
export function workResult(invocation: ToolInvocation, result: ToolResult): ToolResult {
  const args = invocation.args;
  const path = args.filePath ?? args.notebookPath ?? args.dirPath;
  return { ...result,
    filePath: result.filePath ?? (typeof path === "string" ? path : undefined),
    command: result.command ?? (typeof args.command === "string" ? args.command : undefined),
  };
}

export function workHeading(r: ToolResult): string {
  if (r.command) {
    const status = r.exitCode !== undefined && r.exitCode !== null ? `Exited (status ${r.exitCode})`
      : r.exitSignal ? `Exited (${r.exitSignal})` : r.taskId ? "Started in background" : r.success ? "Ran" : "Failed";
    return `${status} ${r.command}`;
  }
  const label: Record<string, string> = { read: "Read", grep: "Searched", glob: "Listed", ls: "Listed", write: "Wrote", edit: "Edited", delete: "Deleted", swarm: "Swarm" };
  return `${r.success ? label[r.tool] || r.tool : `Failed ${r.tool}`}${r.filePath ? ` ${r.filePath}` : ""}`;
}

/** Group adjacent fast edits without delaying commands or mixing worker identities. */
export function createWorkLogBatcher(emit: (agent: string, results: ToolResult[]) => void, delayMs = 25) {
  let pending: ToolResult[] = [], agent = "", timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (pending.length) { const ready = pending; pending = []; emit(agent, ready); }
  };
  return {
    push(owner: string, result: ToolResult) {
      if (pending.length && (owner !== agent || !result.success || !result.diff)) flush();
      agent = owner;
      if (!result.success || !result.diff) { emit(owner, [result]); return; }
      pending.push(result);
      if (!timer) timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() { if (timer) clearTimeout(timer); timer = undefined; pending = []; },
  };
}
