import { getAllAgents } from "./custom-agents.js";
import { getCostPerMessage } from "./cost-tracker.js";
import { resolveModelTier } from "./fast-model-map.js";
import type { AgentLifecycleEvent, AgentRunOptions } from "./agent-runner.js";
import type { CLIConfig, Message, ToolResult } from "./types.js";
import type { UsageData } from "./providers.js";
import type { SwarmBranch, SwarmPlan } from "./swarm.js";

export type SwarmEvent =
  | { type: "swarm_start"; id: string; plan: SwarmPlan }
  | { type: "swarm_progress"; id: string; branches: SwarmBranch[] }
  | { type: "swarm_activity"; id: string; taskId: string; event: AgentLifecycleEvent }
  | { type: "swarm_end"; id: string; success: boolean };

export function autonomousSwarmPrompt(): string {
  return `Du kannst selbst das Werkzeug swarm einsetzen, wenn ein Auftrag mehrere sinnvoll unabhängige Arbeitspakete hat. Entscheide selbst; der Nutzer muss keinen Slash-Befehl eingeben. Kleine oder eng gekoppelte Aufgaben erledigst du direkt. Kündige den Teamstart kurz an. Übergib einen konkreten Plan mit title, concurrency (Standard 3) und tasks. Jeder Task braucht id, agentId, description; optional dependsOn, writePaths (wörtliche relative Pfade, keine Globs), exclusive. Leere writePaths = nur lesen. Teile parallele Schreibarbeit in disjunkte Dateibereiche. Shell, Builds und Tests brauchen exclusive:true und laufen allein. Plane eine abschliessende Prüfung mit dependsOn auf die Arbeitspakete. Nach dem Tool-Ergebnis prüfst du Status und Berichte, arbeitest bei Bedarf weiter und beantwortest den ursprünglichen Auftrag. Wenn ein Plan oder Tool scheitert, lies den Fehler, korrigiere den Plan oder nutze eine verfügbare Alternative und arbeite am Ziel weiter. Ein fehlgeschlagener Task ist kein Erfolg. Berechtigungen, Budget und Abbruch bleiben verbindlich. Keine rekursiven Swarms. Agent-IDs: ${Object.keys(getAllAgents()).join(", ")}.
Text-Tool-Format (falls keine nativen Tools): <tool:swarm>{"title":"...","tasks":[{"id":"a","agentId":"code","description":"...","writePaths":["src/a.ts"]},{"id":"b","agentId":"review","description":"...","dependsOn":["a"]}]}</tool:swarm>`;
}

/** Runs inside the parent's already-authorized tool boundary, never a global executor. */
export async function executeAutonomousSwarm(
  id: string, args: Record<string, unknown>, messages: Message[], config: CLIConfig,
  cwd: string, options: AgentRunOptions, spent: number,
  emit: (event: SwarmEvent) => void,
): Promise<{ result: ToolResult; usage: UsageData; costUsd: number }> {
  const { validateSwarmPlan, runSwarm } = await import("./swarm.js");
  const plan = validateSwarmPlan(args, cwd);
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const userTask = messages.filter(m => m.role === "user" && !m.contextKind).at(-1)?.content ?? "";
  const agents = getAllAgents();
  const usage: UsageData = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let costUsd = 0, success = false;
  emit({ type: "swarm_start", id, plan });
  try {
    const results = await runSwarm(plan, { ...config, jsonSchema: undefined, enableSwarm: false }, cwd,
      `${system}\n\nÜbergeordneter Nutzerauftrag (Kontext für die Teilaufgaben):\n${userTask}`,
      options.signal,
      branches => emit({ type: "swarm_progress", id, branches }),
      {
        initialCostUsd: spent,
        onApproval: options.onApproval,
        streamFn: options.streamFn,
        textToolExecFn: options.textToolExecFn,
        nativeToolExecFn: options.nativeToolExecFn,
        onTaskEvent: (task, event) => {
          if (event.type === "usage") {
            usage.inputTokens += event.usage.inputTokens;
            usage.outputTokens += event.usage.outputTokens;
            usage.totalTokens += event.usage.totalTokens;
            const model = agents[task.agentId]?.model;
            const billedModel = model ? resolveModelTier(model, config.provider) || config.model : config.model;
            costUsd += getCostPerMessage(billedModel, event.usage.inputTokens, event.usage.outputTokens, config.provider);
          }
          // Public assistant text and work events only; reasoning stays private.
          if (["content_delta", "backend_activity", "tool_requested", "tool_result", "approval_required", "approval_decision"].includes(event.type)) {
            emit({ type: "swarm_activity", id, taskId: task.id, event });
          }
        },
      });
    success = results.every(r => r.task.status === "completed");
    const limit = Math.floor(48000 / Math.max(1, results.length));
    const reports = results.map(r => ({
      id: r.task.id, agentId: r.task.agentId, status: r.task.status, error: r.task.error,
      report: r.fullResponse.slice(-limit), truncated: r.fullResponse.length > limit,
      tools: r.task.toolsUsed, durationMs: r.task.duration,
    }));
    return { result: { tool: "swarm", success, result: JSON.stringify({ title: plan.title, success, tasks: reports }) }, usage, costUsd };
  } finally { emit({ type: "swarm_end", id, success }); }
}
