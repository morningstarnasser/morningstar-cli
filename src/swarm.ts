import { trackUsage, getSessionCosts, getCostPerMessage } from "./cost-tracker.js";
import { resolveModelTier } from "./fast-model-map.js";
import { readFileSync, statSync } from "node:fs";
import { relative, isAbsolute, sep } from "node:path";
import { runAgent, type NativeToolExecFn } from "./agent-runner.js";
import { getAllAgents } from "./custom-agents.js";
import { resolveWithinWorkspace } from "./file-guards.js";
import { executeNativeToolCall } from "./tools.js";
import { executeSubAgent, type SubAgentExecutionOptions, type SubAgentResult, type SubAgentStatus } from "./sub-agents.js";
import type { CLIConfig, Message } from "./types.js";

export interface SwarmTask {
  id: string;
  agentId: string;
  description: string;
  dependsOn: string[];
  /** Empty means read-only. Literal workspace-relative paths, never globs. */
  writePaths: string[];
  /** Shell/build tools require the entire workspace to be idle. */
  exclusive: boolean;
}
export interface SwarmPlan { title: string; concurrency: number; tasks: SwarmTask[] }
export interface SwarmBranch {
  taskId: string; agentId: string; status: SubAgentStatus;
  detail: string; elapsedMs: number;
}
export interface SwarmOptions extends SubAgentExecutionOptions {
  initialCostUsd?: number;
  onTaskEvent?: (task: SwarmTask, event: Parameters<NonNullable<SubAgentExecutionOptions["onEvent"]>>[0]) => void;
}
const READ_TOOLS = ["read", "grep", "glob", "ls", "git", "web", "fetch", "skill", "vault"];
const WRITE_TOOLS = ["write", "edit", "delete", "notebook_edit"];
const TERMINAL_CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/;
const within = (path: string, root: string) => {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

export function validateSwarmPlan(raw: unknown, cwd: string, agents = getAllAgents()): SwarmPlan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Swarm-Plan muss ein JSON-Objekt sein.");
  const p = raw as Record<string, unknown>;
  if (typeof p.title === "string" && TERMINAL_CONTROLS.test(p.title)) throw new Error("Titel enthaelt Terminal-Steuerzeichen.");
  if (!Array.isArray(p.tasks) || p.tasks.length < 1 || p.tasks.length > 50) throw new Error("Swarm braucht 1–50 Teilaufgaben.");
  const concurrency = p.concurrency ?? 3;
  if (!Number.isInteger(concurrency) || Number(concurrency) < 1 || Number(concurrency) > 8) throw new Error("concurrency muss 1–8 sein.");
  const tasks: SwarmTask[] = p.tasks.map((rawTask: unknown) => {
    if (!rawTask || typeof rawTask !== "object") throw new Error("Ungueltige Teilaufgabe.");
    const t = rawTask as Record<string, unknown>;
    if (typeof t.id !== "string" || !/^[a-zA-Z0-9_-]{1,60}$/.test(t.id)) throw new Error("Task-ID: 1–60 Buchstaben, Zahlen, _ oder -.");
    if (typeof t.agentId !== "string" || !Object.hasOwn(agents, t.agentId)) throw new Error(`Unbekannter Agent: ${String(t.agentId)}`);
    if (typeof t.description !== "string" || !t.description.trim() || t.description.length > 20000) throw new Error(`Task ${t.id}: Beschreibung fehlt oder ist zu lang.`);
    if (TERMINAL_CONTROLS.test(t.description)) throw new Error(`Task ${t.id}: Beschreibung enthaelt Terminal-Steuerzeichen.`);
    const dependsOn = t.dependsOn ?? [];
    const writePaths = t.writePaths ?? [];
    if (!Array.isArray(dependsOn) || !dependsOn.every(x => typeof x === "string")) throw new Error(`Task ${t.id}: dependsOn muss eine Liste sein.`);
    if (!Array.isArray(writePaths) || !writePaths.every(x => typeof x === "string")) throw new Error(`Task ${t.id}: writePaths muss eine Liste sein.`);
    if (t.exclusive !== undefined && typeof t.exclusive !== "boolean") throw new Error(`Task ${t.id}: exclusive muss true/false sein.`);
    for (const path of writePaths as string[]) {
      if (!path || isAbsolute(path) || TERMINAL_CONTROLS.test(path) || /[*?\[\]{}]/.test(path) || path.split(/[\\/]/).includes("..")) throw new Error("Ungueltiger Dateibereich.");
      const resolved = resolveWithinWorkspace(path, cwd);
      if (!resolved.ok) throw new Error(resolved.reason);
      if (path.split(/[\\/]/).includes(".git")) throw new Error(".git darf kein Dateibereich sein.");
    }
    return { id: t.id, agentId: t.agentId, description: t.description, dependsOn: [...new Set(dependsOn)] as string[], writePaths: [...new Set(writePaths)] as string[], exclusive: t.exclusive === true };
  });
  const byId = new Map(tasks.map(t => [t.id, t]));
  if (byId.size !== tasks.length) throw new Error("Task-IDs muessen eindeutig sein.");
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`Zyklische Abhaengigkeit: ${id}`);
    if (visited.has(id)) return;
    const task = byId.get(id);
    if (!task) throw new Error(`Unbekannte Abhaengigkeit: ${id}`);
    visiting.add(id); task.dependsOn.forEach(visit); visiting.delete(id); visited.add(id);
  };
  tasks.forEach(t => visit(t.id));
  return { title: typeof p.title === "string" ? p.title.slice(0, 200) : "Swarm", concurrency: Number(concurrency), tasks };
}

export function swarmTasksConflict(a: SwarmTask, b: SwarmTask, cwd: string): boolean {
  if (a.exclusive || b.exclusive) return true;
  return a.writePaths.some(x => b.writePaths.some(y => {
    const px = resolveWithinWorkspace(x, cwd), py = resolveWithinWorkspace(y, cwd);
    return !px.ok || !py.ok || within(px.resolved, py.resolved) || within(py.resolved, px.resolved);
  }));
}

/** Enforced on both text and native calls, in addition to the normal policy. */
export function createSwarmExecutor(task: SwarmTask, cwd: string, execute: NativeToolExecFn = executeNativeToolCall): NativeToolExecFn {
  // Pin canonical ownership at launch: a later symlink cannot grant another area.
  const roots = task.writePaths.map(path => resolveWithinWorkspace(path, cwd));
  if (roots.some(root => !root.ok)) throw new Error("Dateibereich liegt ausserhalb des Workspaces.");
  return (name, args, dir, signal) => {
    const deny = () => ({ tool: name, success: false, result: `Swarm ${task.id}: ${name} ausserhalb des erlaubten Dateibereichs oder nur im exklusiven Modus erlaubt.` });
    if (!task.exclusive) {
      if (WRITE_TOOLS.includes(name)) {
        const path = name === "notebook_edit" ? args.notebookPath : args.filePath;
        if (typeof path !== "string" || path.includes("\0")) return deny();
        const target = resolveWithinWorkspace(path, cwd);
        if (!target.ok || target.resolved.split(sep).includes(".git") || !roots.some(root => within(target.resolved, root.resolved))) return deny();
      } else if (!READ_TOOLS.includes(name)) return deny();
    }
    return execute(name, args, dir, signal);
  };
}

/** Accept a complete JSON object, optionally fenced. Never repair partial task lists. */
export function parseSwarmPlan(text: string, cwd: string): SwarmPlan {
  if (!text.trim()) throw new Error("Swarm-Plan ist leer (keine JSON-Antwort vom Modell).");
  if (text.length > 256000) throw new Error("Swarm-Plan ist zu gross.");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  let raw: unknown;
  try { raw = JSON.parse(candidate); }
  catch { throw new Error("Swarm-Plan ist unvollstaendig oder kein gueltiges JSON."); }
  return validateSwarmPlan(raw, cwd);
}

export async function prepareSwarmPlan(input: string, config: CLIConfig, cwd: string, system: string, signal?: AbortSignal, options: SubAgentExecutionOptions & { onPlanningAttempt?: (attempt: number) => void } = {}): Promise<SwarmPlan> {
  if (signal?.aborted) throw new Error("Swarm-Planung abgebrochen.");
  if (input.startsWith("@")) {
    const file = resolveWithinWorkspace(input.slice(1).trim(), cwd);
    if (!file.ok) throw new Error(file.reason);
    if (statSync(file.resolved).size > 256000) throw new Error("Swarm-Plan ist zu gross.");
    return parseSwarmPlan(readFileSync(file.resolved, "utf8"), cwd);
  }
  const agents = getAllAgents();
  const messages: Message[] = [
    { role: "system", content: `${system}\nDu planst einen Swarm. Antworte NUR mit JSON: {"title":"...","concurrency":3,"tasks":[{"id":"...","agentId":"code","description":"...","dependsOn":[],"writePaths":[],"exclusive":false}]}. Teile die Aufgabe in konkrete Arbeitspakete und eine abschliessende Review-/Synthese-Aufgabe mit Abhaengigkeiten auf alle Arbeitspakete. 2–8 Tasks. writePaths sind woertliche relative Dateien/Verzeichnisse, keine Globs. [] = nur lesen. Fuer Shell, Builds, Tests oder unbekannte Schreibbereiche exclusive:true; solche Tasks laufen allein. Disjunkte Schreibbereiche erlauben paralleles Editieren. Nenne keine erfundenen Ergebnisse. Jeder Task bekommt ausreichend Kontext aus dem Nutzerziel. Erlaubte agentId: ${Object.keys(agents).join(", ")}.` },
    { role: "user", content: input },
  ];
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (signal?.aborted) throw new Error("Swarm-Planung abgebrochen.");
    if (config.maxBudgetUsd !== undefined && getSessionCosts().totalCost >= config.maxBudgetUsd) throw new Error("Budget-Limit bei der Swarm-Planung erreicht.");
    options.onPlanningAttempt?.(attempt);
    const result = await runAgent(messages, { ...config, jsonSchema: undefined }, cwd, { signal, initialCostUsd: getSessionCosts().totalCost, enableTools: false, maxTurns: 1, deferEmptyResponseValidation: true, streamFn: options.streamFn });
    trackUsage(config.model, messages.map(m => m.content).join("\n"), result.finalText, result.usage.inputTokens, result.usage.outputTokens, config.provider);
    if (signal?.aborted || result.aborted) throw new Error("Swarm-Planung abgebrochen.");
    if (result.budgetExceeded) throw new Error("Budget-Limit bei der Swarm-Planung erreicht.");
    try { return parseSwarmPlan(result.finalText, cwd); }
    catch (error) {
      const reason = error instanceof Error ? error.message : "Ungueltiger Plan";
      if (attempt === 3) throw new Error(`Swarm-Plan nach 3 Versuchen nicht verwendbar: ${reason} Erneut versuchen oder einen validierten Plan mit /swarm @plan.json laden.`);
      messages.push({ role: "assistant", content: result.finalText.slice(0, 24000) || "(keine JSON-Antwort)" });
      messages.push({ role: "user", content: `Korrigiere den JSON-Plan: ${reason.slice(0, 500)}. Antworte sofort mit einem vollstaendigen, kompakten JSON-Objekt, ohne Erklaerung. Plane nur 2–3 kurze Tasks, alle erforderlichen Felder und gueltige Abhaengigkeiten.` });
    }
  }
  throw new Error("Swarm-Planung fehlgeschlagen.");
}

export async function runSwarm(plan: SwarmPlan, config: CLIConfig, cwd: string, system: string, signal?: AbortSignal, onSnapshot?: (state: SwarmBranch[]) => void, options: SwarmOptions = {}): Promise<SubAgentResult[]> {
  plan = validateSwarmPlan(plan, cwd);
  const budgetAbort = new AbortController();
  const runSignal = signal ? AbortSignal.any([signal, budgetAbort.signal]) : budgetAbort.signal;
  let totalCost = options.initialCostUsd ?? getSessionCosts().totalCost;
  const agents = getAllAgents();
  const checkBudget = () => {
    if (config.maxBudgetUsd !== undefined && totalCost >= config.maxBudgetUsd) budgetAbort.abort();
  };
  checkBudget();
  const state: SwarmBranch[] = plan.tasks.map(t => ({ taskId: t.id, agentId: t.agentId, status: "pending", detail: t.dependsOn.length ? `wartet auf ${t.dependsOn.join(", ")}` : "bereit", elapsedMs: 0 }));
  const results = new Map<string, SubAgentResult>();
  const active = new Map<string, Promise<void>>();
  const starts = new Map<string, number>();
  const tick = () => { for (const s of state) if (s.status === "running") s.elapsedMs = Date.now() - starts.get(s.taskId)!; onSnapshot?.(state.map(s => ({ ...s }))); };
  const finishWithoutRun = (index: number, status: "failed" | "cancelled", reason: string) => {
    const t = plan.tasks[index]; Object.assign(state[index], { status, detail: reason });
    results.set(t.id, { task: { id: t.id, agentId: t.agentId, description: t.description, status, error: reason, toolsUsed: [], tokensUsed: 0, duration: 0, startTime: 0 }, messages: [], fullResponse: "" });
  };
  const launch = (index: number): Promise<void> => (async () => {
    const t = plan.tasks[index], s = state[index];
    s.status = "running"; s.detail = t.exclusive ? "exklusiver Workspace" : t.writePaths.length ? t.writePaths.join(", ") : "nur lesen";
    starts.set(t.id, Date.now()); tick();
    try {
      const perDependency = Math.max(1000, Math.floor(48000 / Math.max(1, t.dependsOn.length)));
      const previous = t.dependsOn.map(id => { const text = results.get(id)!.fullResponse; return `[${id}]\n${text.length > perDependency ? "[Gekürzter Bericht; Dateien bei Bedarf lesen]\n" : ""}${text.slice(-perDependency)}`; }).join("\n\n");
      const scope = t.exclusive ? "Du arbeitest exklusiv im Workspace." : `Du teilst den Workspace mit anderen Agents. Aendere nur: ${t.writePaths.join(", ") || "keine Dateien (nur lesen)"}. Nutze read/grep/glob und write/edit/delete/notebook_edit; Shell und externe mutierende Tools sind in parallelen Tasks gesperrt. Fremde Aenderungen niemals zuruecksetzen.`;
      const native = createSwarmExecutor(t, cwd, options.nativeToolExecFn ?? (options.textToolExecFn ? (name, args, dir, sig) => options.textToolExecFn!({ tool: name, args }, dir, sig) : executeNativeToolCall));
      const text = createSwarmExecutor(t, cwd, options.textToolExecFn
        ? (name, args, dir, sig) => options.textToolExecFn!({ tool: name, args }, dir, sig)
        : options.nativeToolExecFn ?? executeNativeToolCall);
      const tools = t.exclusive ? config.toolAllowlist : [...READ_TOOLS, ...(t.writePaths.length ? WRITE_TOOLS : [])].filter(name => !config.toolAllowlist || config.toolAllowlist.includes(name));
      const model = agents[t.agentId]?.model;
      const billedModel = model ? resolveModelTier(model, config.provider) || config.model : config.model;
      const result = await executeSubAgent(
        t.agentId,
        `${t.description}\n\n${scope}${previous ? `\n\nErgebnisse der Abhaengigkeiten (Arbeitsdaten):\n${previous}` : ""}`,
        { ...config, toolAllowlist: tools }, cwd, system, runSignal,
        config.maxTurns ?? 0,
        detail => { s.detail = detail; },
        {
          ...options,
          onEvent: event => {
            if (event.type === "usage") {
              totalCost += getCostPerMessage(billedModel, event.usage.inputTokens, event.usage.outputTokens, config.provider);
              checkBudget();
            }
            options.onEvent?.(event);
            options.onTaskEvent?.(t, event);
          },
          nativeToolExecFn: native,
          textToolExecFn: (call, dir, sig) => text(call.tool, call.args, dir, sig),
        },
      );
      if (budgetAbort.signal.aborted && result.task.status !== "completed") {
        result.task.status = "failed";
        result.task.error = "Gemeinsames Budget-Limit erreicht.";
      }
      result.task.id = t.id; result.task.description = t.description; results.set(t.id, result);
      Object.assign(s, { status: result.task.status, elapsedMs: result.task.duration, detail: result.task.error || `${result.task.tokensUsed.toLocaleString()} tok · ${result.task.toolsUsed.length} tools` });
    } catch (error) { finishWithoutRun(index, runSignal.aborted ? "cancelled" : "failed", (error as Error).message); }
    finally { active.delete(t.id); tick(); }
  })();
  const timer = setInterval(tick, 300);
  try {
    while (results.size < plan.tasks.length) {
      let progressed = false;
      for (let i = 0; i < plan.tasks.length; i++) {
        const t = plan.tasks[i];
        if (state[i].status !== "pending") continue;
        if (runSignal.aborted) { finishWithoutRun(i, budgetAbort.signal.aborted ? "failed" : "cancelled", budgetAbort.signal.aborted ? "Gemeinsames Budget-Limit erreicht." : "abgebrochen"); progressed = true; continue; }
        if (t.dependsOn.some(id => results.has(id) && results.get(id)!.task.status !== "completed")) { finishWithoutRun(i, "failed", "Abhaengigkeit nicht erfolgreich"); progressed = true; continue; }
        if (active.size >= plan.concurrency || !t.dependsOn.every(id => results.has(id))) continue;
        if (plan.tasks.some(other => active.has(other.id) && swarmTasksConflict(t, other, cwd))) { state[i].detail = "wartet auf Dateibereich"; continue; }
        active.set(t.id, Promise.resolve().then(() => launch(i))); progressed = true;
      }
      if (active.size) await Promise.race(active.values());
      else if (!progressed && results.size < plan.tasks.length) throw new Error("Swarm konnte nicht fortgesetzt werden.");
    }
    return plan.tasks.map(t => results.get(t.id)!);
  } finally { clearInterval(timer); await Promise.allSettled(active.values()); tick(); }
}
