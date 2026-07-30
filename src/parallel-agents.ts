// ─── Parallel Sub-Agents ─────────────────────────────────────────────────────
// Run several independent agent tasks concurrently and aggregate their answers.
// Used by the Telegram /parallel command — fan out work from your phone, which
// neither Codex nor Hermes can do. Built on the shared agent-runner so each task
// gets the full multi-turn tool loop.

import {
  runAgent,
  type AgentRunOptions,
  type StreamFn,
} from "./agent-runner.js";
import type { CLIConfig, Message } from "./types.js";

const MAX_TASKS = 5;

export interface AgentTask {
  label: string;
  prompt: string;
}

export interface AgentTaskResult {
  label: string;
  text: string;
  tools: number;
  ok: boolean;
}

/**
 * Parse a free-text block into discrete tasks. One per line; if a single line,
 * split on ";". Leading bullets/numbers are stripped. Pure + testable.
 */
export function parseTasks(text: string): AgentTask[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let parts = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (parts.length === 1) parts = parts[0].split(";").map((p) => p.trim()).filter(Boolean);

  return parts.map((raw) => {
    const prompt = raw.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim();
    const label = prompt.length > 32 ? `${prompt.slice(0, 32)}…` : prompt;
    return { label, prompt };
  });
}

export interface RunParallelOptions {
  maxTurns?: number;
  signal?: AbortSignal;
  streamFn?: StreamFn;
  onApproval?: AgentRunOptions["onApproval"];
  buildMessages: (prompt: string) => Message[];
}

/**
 * Run all tasks concurrently. Capped at MAX_TASKS — extra tasks are dropped (the
 * caller is told). Each task that throws yields an ok:false result instead of
 * failing the whole batch.
 */
export async function runParallel(
  tasks: AgentTask[],
  config: CLIConfig,
  cwd: string,
  options: RunParallelOptions,
): Promise<{ results: AgentTaskResult[]; dropped: number }> {
  const capped = tasks.slice(0, MAX_TASKS);
  const dropped = tasks.length - capped.length;

  const results = await Promise.all(
    capped.map(async (task): Promise<AgentTaskResult> => {
      try {
        const result = await runAgent(options.buildMessages(task.prompt), config, cwd, {
          maxTurns: options.maxTurns,
          signal: options.signal,
          streamFn: options.streamFn,
          onApproval: options.onApproval,
        });
        if (result.aborted) {
          return {
            label: task.label,
            text: result.finalText || "Abgebrochen.",
            tools: result.toolCalls.length,
            ok: false,
          };
        }
        return { label: task.label, text: result.finalText || "(kein Output)", tools: result.toolCalls.length, ok: true };
      } catch (e) {
        return { label: task.label, text: `Fehler: ${(e as Error).message}`, tools: 0, ok: false };
      }
    }),
  );

  return { results, dropped };
}

/** Render aggregated results into one Telegram message. */
export function formatParallelResults(results: AgentTaskResult[], dropped: number): string {
  const blocks = results.map((r, i) => `*${i + 1}. ${r.ok ? "" : "⚠️ "}${r.label}*\n${r.text}${r.tools ? `\n_(${r.tools} Tools)_` : ""}`);
  const note = dropped > 0 ? `\n\n_${dropped} Task(s) verworfen (max ${MAX_TASKS} parallel)._` : "";
  return `🧩 ${results.length} parallele Agenten:\n\n${blocks.join("\n\n")}${note}`;
}
