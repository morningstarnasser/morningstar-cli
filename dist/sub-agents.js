// ─── Sub-Agent / Task Delegation System ──────────────────
// Enables the AI to delegate tasks to specialized sub-agents.
// Each sub-agent gets its own conversation context but shares
// the same tools and file system access.
import { streamChat } from "./ai.js";
import { executeToolCalls, setAgentToolFilter } from "./tools.js";
import { getAllAgents } from "./custom-agents.js";
import { getAgentPrompt } from "./agents.js";
import { trackUsage } from "./cost-tracker.js";
import { resolveModelTier } from "./fast-model-map.js";
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
export async function executeSubAgent(agentId, taskDescription, config, cwd, baseSystemPrompt, signal, maxTurns = 5, onProgress) {
    const startTime = Date.now();
    const task = {
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
    // Set tool restrictions for this sub-agent
    if (agent?.tools && agent.tools.length > 0) {
        setAgentToolFilter(agent.tools);
    }
    const messages = [
        { role: "system", content: systemPrompt + "\n\nDu bist ein Sub-Agent. Fuehre die folgende Aufgabe autonom aus und berichte das Ergebnis." },
        { role: "user", content: taskDescription },
    ];
    let fullResponse = "";
    let totalTokens = 0;
    try {
        // Initial streaming
        onProgress?.(`Sub-Agent [${agent?.name || agentId}] startet...`);
        let currentResponse = "";
        for await (const token of streamChat(messages, resolvedConfig, signal)) {
            if (signal?.aborted) {
                task.status = "cancelled";
                break;
            }
            if (token.type === "content") {
                currentResponse += token.text;
            }
            else if (token.type === "usage" && token.usage) {
                totalTokens += token.usage.totalTokens;
            }
        }
        fullResponse = currentResponse;
        trackUsage(resolvedConfig.model, taskDescription, currentResponse);
        // Multi-turn tool loop
        let depth = 0;
        let latestMessages = messages;
        let lastToolSig = "";
        while (depth < maxTurns && currentResponse && !signal?.aborted) {
            let toolResults = null;
            try {
                toolResults = await executeToolCalls(currentResponse, cwd);
            }
            catch {
                break;
            }
            if (!toolResults || toolResults.results.length === 0)
                break;
            // Track tools used
            for (const r of toolResults.results) {
                if (!task.toolsUsed.includes(r.tool))
                    task.toolsUsed.push(r.tool);
            }
            // Loop detection
            const toolSig = toolResults.results.map(r => `${r.tool}:${r.filePath || r.command || ""}`).join("|");
            if (toolSig === lastToolSig)
                break;
            lastToolSig = toolSig;
            onProgress?.(`Sub-Agent [${agent?.name || agentId}] Turn ${depth + 2}/${maxTurns}...`);
            const toolFeedback = toolResults.results
                .map(r => `[Tool: ${r.tool}] ${r.success ? "ERFOLG" : "FEHLGESCHLAGEN"}: ${r.result}`)
                .join("\n\n");
            latestMessages = [
                ...latestMessages,
                { role: "assistant", content: currentResponse },
                { role: "user", content: `Tool-Ergebnisse:\n${toolFeedback}\n\nFahre fort mit der Aufgabe.` },
            ];
            // Next streaming round
            currentResponse = "";
            for await (const token of streamChat(latestMessages, resolvedConfig, signal)) {
                if (signal?.aborted)
                    break;
                if (token.type === "content") {
                    currentResponse += token.text;
                }
                else if (token.type === "usage" && token.usage) {
                    totalTokens += token.usage.totalTokens;
                }
            }
            if (currentResponse) {
                fullResponse = currentResponse;
                trackUsage(resolvedConfig.model, toolFeedback, currentResponse);
            }
            depth++;
        }
        task.status = signal?.aborted ? "cancelled" : "completed";
        task.result = fullResponse;
    }
    catch (e) {
        task.status = "failed";
        task.error = e.message;
    }
    // Clear tool filter after sub-agent completes
    setAgentToolFilter(null);
    task.duration = Date.now() - startTime;
    task.tokensUsed = totalTokens;
    return { task, messages, fullResponse };
}
/**
 * Execute multiple sub-agent tasks sequentially.
 * Each task can see the results of previous tasks.
 */
export async function executeSubAgentPipeline(tasks, config, cwd, baseSystemPrompt, signal, onProgress) {
    const results = [];
    for (let i = 0; i < tasks.length; i++) {
        if (signal?.aborted)
            break;
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
        const result = await executeSubAgent(task.agentId, enrichedDescription, config, cwd, baseSystemPrompt, signal, 5, (status) => onProgress?.(i, status));
        results.push(result);
    }
    return results;
}
/**
 * Execute multiple sub-agents truly in parallel. Each task runs concurrently
 * with its own abort signal chained from the parent signal. Progress is
 * reported per-agent as a snapshot array so callers can render a live tree.
 */
export async function executeSubAgentsParallel(tasks, config, cwd, baseSystemPrompt, signal, onSnapshot) {
    const started = Date.now();
    const state = tasks.map((t) => ({
        agentId: t.agentId,
        status: "pending",
        detail: "queued",
        elapsedMs: 0,
    }));
    function tick() {
        const now = Date.now();
        for (const s of state) {
            if (s.status === "running")
                s.elapsedMs = now - started;
        }
        onSnapshot?.(state.map((s) => ({ ...s })));
    }
    const interval = setInterval(tick, 300);
    try {
        const promises = tasks.map((task, idx) => (async () => {
            state[idx].status = "running";
            state[idx].detail = "starting";
            tick();
            try {
                const result = await executeSubAgent(task.agentId, task.description, config, cwd, baseSystemPrompt, signal, 5, (status) => {
                    state[idx].detail = status.length > 48 ? `${status.slice(0, 45)}…` : status;
                });
                state[idx].status = result.task.status;
                state[idx].detail = result.task.status === "completed"
                    ? `${result.task.tokensUsed.toLocaleString()} tok`
                    : (result.task.error || "failed");
                state[idx].elapsedMs = result.task.duration;
                tick();
                return result;
            }
            catch (err) {
                state[idx].status = "failed";
                state[idx].detail = err.message;
                tick();
                throw err;
            }
        })());
        const settled = await Promise.allSettled(promises);
        const results = [];
        for (const s of settled) {
            if (s.status === "fulfilled")
                results.push(s.value);
        }
        return results;
    }
    finally {
        clearInterval(interval);
        tick();
    }
}
/**
 * Format sub-agent results for display.
 */
export function formatSubAgentResults(results) {
    const lines = [];
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
export function getAvailableSubAgents() {
    const allAgents = getAllAgents();
    return Object.entries(allAgents).map(([id, a]) => ({
        id,
        name: a.name,
        description: a.description,
    }));
}
//# sourceMappingURL=sub-agents.js.map