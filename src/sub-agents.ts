// ─── Sub-Agent / Task Delegation System ──────────────────
// Enables the AI to delegate tasks to specialized sub-agents.
// Each sub-agent gets its own conversation context but shares
// the same tools and file system access.

import type { Message, CLIConfig } from "./types.js";
import { streamChat } from "./ai.js";
import { executeToolCalls } from "./tools.js";
import { getAllAgents } from "./custom-agents.js";
import { getAgentPrompt } from "./agents.js";
import { trackUsage } from "./cost-tracker.js";

// ─── Types ───────────────────────────────────────────────

export type SubAgentStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface SubAgentTask {
  id: string;
  agentId: string;
  description: string;
  status: SubAgentStatus;
  result?: string;
  error?: string;
  toolsUsed: string[];
  tokensUsed: number;
  duration: number;
  startTime: number;
}

export interface SubAgentResult {
  task: SubAgentTask;
  messages: Message[];
  fullResponse: string;
}

// ─── Sub-Agent Execution ─────────────────────────────────

/**
 * Execute a sub-agent task. The sub-agent gets:
 * - Its own agent system prompt
 * - The task description as user message
 * - Access to all tools
 * - A limited number of turns (maxTurns)
 *
 * Returns the completed task with results.
 */
export async function executeSubAgent(
  agentId: string,
  taskDescription: string,
  config: CLIConfig,
  cwd: string,
  baseSystemPrompt: string,
  signal?: AbortSignal,
  maxTurns: number = 5,
  onProgress?: (status: string) => void,
): Promise<SubAgentResult> {
  const startTime = Date.now();

  const task: SubAgentTask = {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    agentId,
    description: taskDescription,
    status: "running",
    toolsUsed: [],
    tokensUsed: 0,
    duration: 0,
    startTime,
  };

  // Build sub-agent system prompt
  const allAgents = getAllAgents();
  const agent = allAgents[agentId];
  const systemPrompt = agent
    ? getAgentPrompt(agentId, baseSystemPrompt, allAgents)
    : baseSystemPrompt;

  const messages: Message[] = [
    { role: "system", content: systemPrompt + "\n\nDu bist ein Sub-Agent. Fuehre die folgende Aufgabe autonom aus und berichte das Ergebnis." },
    { role: "user", content: taskDescription },
  ];

  let fullResponse = "";
  let totalTokens = 0;

  try {
    // Initial streaming
    onProgress?.(`Sub-Agent [${agent?.name || agentId}] startet...`);
    let currentResponse = "";

    for await (const token of streamChat(messages, config, signal)) {
      if (signal?.aborted) { task.status = "cancelled"; break; }
      if (token.type === "content") {
        currentResponse += token.text;
      } else if (token.type === "usage" && token.usage) {
        totalTokens += token.usage.totalTokens;
      }
    }

    fullResponse = currentResponse;
    trackUsage(config.model, taskDescription, currentResponse);

    // Multi-turn tool loop
    let depth = 0;
    let latestMessages = messages;
    let lastToolSig = "";

    while (depth < maxTurns && currentResponse && !signal?.aborted) {
      let toolResults: Awaited<ReturnType<typeof executeToolCalls>> | null = null;
      try { toolResults = await executeToolCalls(currentResponse, cwd); } catch { break; }
      if (!toolResults || toolResults.results.length === 0) break;

      // Track tools used
      for (const r of toolResults.results) {
        if (!task.toolsUsed.includes(r.tool)) task.toolsUsed.push(r.tool);
      }

      // Loop detection
      const toolSig = toolResults.results.map(r => `${r.tool}:${r.filePath || r.command || ""}`).join("|");
      if (toolSig === lastToolSig) break;
      lastToolSig = toolSig;

      onProgress?.(`Sub-Agent [${agent?.name || agentId}] Turn ${depth + 2}/${maxTurns}...`);

      const toolFeedback = toolResults.results
        .map(r => `[Tool: ${r.tool}] ${r.success ? "ERFOLG" : "FEHLGESCHLAGEN"}: ${r.result}`)
        .join("\n\n");

      latestMessages = [
        ...latestMessages,
        { role: "assistant" as const, content: currentResponse },
        { role: "user" as const, content: `Tool-Ergebnisse:\n${toolFeedback}\n\nFahre fort mit der Aufgabe.` },
      ];

      // Next streaming round
      currentResponse = "";
      for await (const token of streamChat(latestMessages, config, signal)) {
        if (signal?.aborted) break;
        if (token.type === "content") {
          currentResponse += token.text;
        } else if (token.type === "usage" && token.usage) {
          totalTokens += token.usage.totalTokens;
        }
      }

      if (currentResponse) {
        fullResponse = currentResponse;
        trackUsage(config.model, toolFeedback, currentResponse);
      }

      depth++;
    }

    task.status = signal?.aborted ? "cancelled" : "completed";
    task.result = fullResponse;
  } catch (e) {
    task.status = "failed";
    task.error = (e as Error).message;
  }

  task.duration = Date.now() - startTime;
  task.tokensUsed = totalTokens;

  return { task, messages, fullResponse };
}

/**
 * Execute multiple sub-agent tasks sequentially.
 * Each task can see the results of previous tasks.
 */
export async function executeSubAgentPipeline(
  tasks: Array<{ agentId: string; description: string }>,
  config: CLIConfig,
  cwd: string,
  baseSystemPrompt: string,
  signal?: AbortSignal,
  onProgress?: (taskIdx: number, status: string) => void,
): Promise<SubAgentResult[]> {
  const results: SubAgentResult[] = [];

  for (let i = 0; i < tasks.length; i++) {
    if (signal?.aborted) break;

    const task = tasks[i];
    let enrichedDescription = task.description;

    // Add context from previous task results
    if (results.length > 0) {
      const previousContext = results
        .filter(r => r.task.status === "completed")
        .map(r => `[${r.task.agentId}]: ${r.task.result?.slice(0, 500) || "Kein Ergebnis"}`)
        .join("\n\n");
      enrichedDescription += `\n\n--- Ergebnisse vorheriger Agents ---\n${previousContext}\n--- Ende ---`;
    }

    onProgress?.(i, `Starte Task ${i + 1}/${tasks.length}...`);

    const result = await executeSubAgent(
      task.agentId,
      enrichedDescription,
      config,
      cwd,
      baseSystemPrompt,
      signal,
      5,
      (status) => onProgress?.(i, status),
    );

    results.push(result);
  }

  return results;
}

/**
 * Format sub-agent results for display.
 */
export function formatSubAgentResults(results: SubAgentResult[]): string {
  const lines: string[] = [];

  for (const r of results) {
    const allAgents = getAllAgents();
    const agent = allAgents[r.task.agentId];
    const name = agent?.name || r.task.agentId;
    const statusIcon = r.task.status === "completed" ? "\u2714" : r.task.status === "failed" ? "\u2718" : "\u25CB";
    const duration = r.task.duration >= 60000
      ? `${Math.floor(r.task.duration / 60000)}m ${Math.round((r.task.duration % 60000) / 1000)}s`
      : `${(r.task.duration / 1000).toFixed(1)}s`;

    lines.push(`${statusIcon} [${name}] ${r.task.description.slice(0, 60)}`);
    lines.push(`  Status: ${r.task.status} | Dauer: ${duration} | Tokens: ${r.task.tokensUsed} | Tools: ${r.task.toolsUsed.join(", ") || "keine"}`);
    if (r.task.error) {
      lines.push(`  Fehler: ${r.task.error}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Get available agents that can be used as sub-agents.
 */
export function getAvailableSubAgents(): Array<{ id: string; name: string; description: string }> {
  const allAgents = getAllAgents();
  return Object.entries(allAgents).map(([id, a]) => ({
    id,
    name: a.name,
    description: a.description,
  }));
}
