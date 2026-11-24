// ─── Sub-Agent / Task Delegation System ──────────────────
// Enables the AI to delegate tasks to specialized sub-agents.
// Each sub-agent gets its own conversation context but shares
// the same tools and file system access.

import type { Message, CLIConfig } from "./types.js";
import {
  runAgent,
  type AgentRunOptions,
  type NativeToolExecFn,
  type StreamFn,
  type TextToolExecFn,
} from "./agent-runner.js";
import {
  executeNativeToolCall,
  executeToolCall,
} from "./tools.js";
import { getAllAgents } from "./custom-agents.js";
import { getAgentPrompt } from "./agents.js";
import { trackUsage } from "./cost-tracker.js";
import { resolveModelTier } from "./fast-model-map.js";

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

export type SubAgentApprovalCallback = NonNullable<AgentRunOptions["onApproval"]>;

/**
 * Optional runner seams shared by direct, sequential, and parallel sub-agent
 * execution. Production callers normally only provide `onApproval`; executor
 * and stream overrides keep the orchestration layer deterministic in tests.
 */
export interface SubAgentExecutionOptions {
  onEvent?: AgentRunOptions["onEvent"];
  onApproval?: SubAgentApprovalCallback;
  streamFn?: StreamFn;
  textToolExecFn?: TextToolExecFn;
  nativeToolExecFn?: NativeToolExecFn;
}

interface ToolExecutorDependencies {
  textToolExecFn?: TextToolExecFn;
  nativeToolExecFn?: NativeToolExecFn;
}

/**
 * Build per-run tool executors for an agent allowlist.
 *
 * This deliberately does not use the legacy process-global agent tool filter:
 * concurrent sub-agents must not overwrite one another's permissions.
 */
export function createSubAgentToolExecutors(
  allowedTools: readonly string[] | undefined,
  dependencies: ToolExecutorDependencies = {},
): {
  textToolExecFn: TextToolExecFn;
  nativeToolExecFn: NativeToolExecFn;
} {
  const allowlist = allowedTools && allowedTools.length > 0
    ? new Set(allowedTools.map((tool) => tool.toLowerCase()))
    : null;
  const textExecutor = dependencies.textToolExecFn ?? executeToolCall;
  const nativeExecutor = dependencies.nativeToolExecFn ?? executeNativeToolCall;

  const denied = (tool: string) => ({
    tool,
    result: `Tool "${tool}" ist fuer diesen Agent nicht erlaubt.`,
    success: false,
  });
  const isAllowed = (tool: string): boolean =>
    allowlist === null || allowlist.has(tool.toLowerCase());

  const textToolExecFn: TextToolExecFn = (call, cwd, signal) => {
    if (!isAllowed(call.tool)) return denied(call.tool);
    return textExecutor(call, cwd, signal);
  };
  const nativeToolExecFn: NativeToolExecFn = (name, args, cwd, signal) => {
    if (!isAllowed(name)) return denied(name);
    return nativeExecutor(name, args, cwd, signal);
  };

  return { textToolExecFn, nativeToolExecFn };
}

// ─── Sub-Agent Execution ─────────────────────────────────

/**
 * Execute a sub-agent task. The sub-agent gets:
 * - Its own agent system prompt
 * - The task description as user message
 * - Access to all tools
 * - Unlimited turns by default; an explicit maxTurns is respected
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
  maxTurns: number = config.maxTurns ?? 0,
  onProgress?: (status: string) => void,
  options: SubAgentExecutionOptions = {},
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

  // Resolve model tier if agent specifies one (opus/sonnet/haiku -> actual model ID)
  let resolvedConfig = config;
  if (agent?.model) {
    const resolvedModel = resolveModelTier(agent.model, config.provider);
    if (resolvedModel) {
      resolvedConfig = { ...config, model: resolvedModel };
    }
  }

  const messages: Message[] = [
    { role: "system", content: systemPrompt + "\n\nDu bist ein Sub-Agent. Fuehre die folgende Aufgabe autonom aus und berichte das Ergebnis." },
    { role: "user", content: taskDescription },
  ];

  let fullResponse = "";
  let transcript = messages;

  try {
    onProgress?.(`Sub-Agent [${agent?.name || agentId}] startet...`);
    const executors = createSubAgentToolExecutors(agent?.tools, options);
    const result = await runAgent(messages, resolvedConfig, cwd, {
      signal,
      maxTurns,
      enableSwarm: false,
      streamFn: options.streamFn,
      toolAllowlist: agent?.tools?.length ? agent.tools : undefined,
      textToolExecFn: executors.textToolExecFn,
      nativeToolExecFn: executors.nativeToolExecFn,
      onApproval: options.onApproval,
      onEvent: (event) => {
        options.onEvent?.(event);
        if (event.type === "tool_requested") {
          const args = event.invocation.args;
          const target = args.filePath ?? args.notebookPath ?? args.command ?? args.query ?? args.pattern ?? "";
          onProgress?.(`${event.invocation.name} · ${String(target).replace(/[\r\n]/g, " ").slice(0, 120)}`);
        }
      },
      onTurnStart: (turn) => {
        if (turn > 1) {
          onProgress?.(`Sub-Agent [${agent?.name || agentId}] Turn ${turn}/${maxTurns || "∞"}...`);
        }
      },
      onTool: (tool) => {
        if (!task.toolsUsed.includes(tool.tool)) task.toolsUsed.push(tool.tool);
      },
    });

    fullResponse = result.finalText;
    transcript = result.messages ?? messages;
    task.tokensUsed = result.usage.totalTokens;
    trackUsage(
      resolvedConfig.model,
      taskDescription,
      fullResponse,
      result.usage.inputTokens,
      result.usage.outputTokens,
      resolvedConfig.provider,
    );

    // A final model sentence cannot turn a denied/failed tool into verified work.
    // The parent receives the report and can retry in a fresh task if appropriate.
    const failedTool = result.toolCalls.find(tool => !tool.success);
    task.status = result.aborted || signal?.aborted ? "cancelled"
      : result.hitTurnLimit || result.budgetExceeded || result.loopDetected || result.toolProtocolError || failedTool ? "failed" : "completed";
    if (task.status === "failed") task.error = result.hitTurnLimit ? "Explizites Turn-Limit erreicht."
      : result.budgetExceeded ? "Budget-Limit erreicht."
      : result.loopDetected ? "Kein Fortschritt: Tool-Schleife erkannt."
      : result.toolProtocolError ? result.toolProtocolError
      : `Tool ${failedTool!.tool} fehlgeschlagen: ${failedTool!.result.slice(0, 500)}`;
    task.result = fullResponse;
  } catch (e) {
    task.status = signal?.aborted ? "cancelled" : "failed";
    task.error = (e as Error).message;
  }

  task.duration = Date.now() - startTime;

  return { task, messages: transcript, fullResponse };
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
  options: SubAgentExecutionOptions = {},
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
      config.maxTurns ?? 0,
      (status) => onProgress?.(i, status),
      options,
    );

    results.push(result);
  }

  return results;
}

/**
 * Execute multiple sub-agents truly in parallel. Each task runs concurrently
 * with its own abort signal chained from the parent signal. Progress is
 * reported per-agent as a snapshot array so callers can render a live tree.
 */
export async function executeSubAgentsParallel(
  tasks: Array<{ agentId: string; description: string }>,
  config: CLIConfig,
  cwd: string,
  baseSystemPrompt: string,
  signal?: AbortSignal,
  onSnapshot?: (snapshot: Array<{
    agentId: string;
    status: SubAgentStatus;
    detail: string;
    elapsedMs: number;
  }>) => void,
  options: SubAgentExecutionOptions = {},
): Promise<SubAgentResult[]> {
  const started = Date.now();
  const state = tasks.map((t) => ({
    agentId: t.agentId,
    status: "pending" as SubAgentStatus,
    detail: "queued",
    elapsedMs: 0,
  }));

  function tick(): void {
    const now = Date.now();
    for (const s of state) {
      if (s.status === "running") s.elapsedMs = now - started;
    }
    onSnapshot?.(state.map((s) => ({ ...s })));
  }

  const interval = setInterval(tick, 300);

  try {
    const promises = tasks.map((task, idx) =>
      (async () => {
        state[idx].status = "running";
        state[idx].detail = "starting";
        tick();
        try {
          const result = await executeSubAgent(
            task.agentId,
            task.description,
            config,
            cwd,
            baseSystemPrompt,
            signal,
            config.maxTurns ?? 0,
            (status) => {
              state[idx].detail = status.length > 48 ? `${status.slice(0, 45)}…` : status;
            },
            options,
          );
          state[idx].status = result.task.status;
          state[idx].detail =
            result.task.status === "completed"
              ? `${result.task.tokensUsed.toLocaleString()} tok`
              : result.task.status === "cancelled"
                ? "abgebrochen"
                : (result.task.error || "fehlgeschlagen");
          state[idx].elapsedMs = result.task.duration;
          tick();
          return result;
        } catch (err) {
          state[idx].status = "failed";
          state[idx].detail = (err as Error).message;
          tick();
          throw err;
        }
      })(),
    );

    const settled = await Promise.allSettled(promises);
    const results: SubAgentResult[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
    }
    return results;
  } finally {
    clearInterval(interval);
    tick();
  }
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
