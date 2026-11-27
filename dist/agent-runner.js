import { compactRequest } from "./runtime/request-context.js";
import { ActiveLearning, isLearnedContext } from "./runtime/active-learning.js";
import { prepareKnowledge } from "./knowledge.js";
import { canonicalToolName } from "./policy-engine.js";
import { createOutputValidator } from "./structured-output.js";
import { runRuntimeHooks } from "./runtime-hooks.js";
import { autonomousSwarmPrompt, executeAutonomousSwarm } from "./swarm-tool.js";
import { WORK_GUIDANCE } from "./runtime/work-guidance.js";
import { scopeStatusConclusion } from "./runtime/status-grounding.js";
import { isMalformedToolAttempt } from "./runtime/tool-protocol.js";
import { formatConnectedMCPToolsForPrompt, stripGeneratedMCPPrompt } from "./mcp.js";
import { getOpenAIToolDefinitions } from "./tool-definitions.js";
// ─── Shared Headless Agentic Engine ──────────────────────────────────────────
// Canonical model -> authorization -> tool -> feedback loop used by every
// non-interactive runtime. Provider-native and text tool calls are normalized
// into the same invocation contract before policy evaluation.
import { streamChat as realStreamChat } from "./ai.js";
import { executeNativeToolCall as realExecuteNativeToolCall, executeToolCall as realExecuteToolCall, parseToolCalls, } from "./tools.js";
import { extractFinalAnswerText, isFinalAnswerTool } from "./final-answer.js";
import { decidePermission } from "./policy-engine.js";
import { getCostPerMessage } from "./cost-tracker.js";
/** Zero and omission mean unlimited; explicit finite limits remain available. */
export function resolveTurnLimit(value) {
    if (value === undefined || value === 0)
        return Infinity;
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("maxTurns must be a non-negative integer (0 = unlimited)");
    return value;
}
const LOOP_SENSITIVE_TOOLS = new Set([
    "write",
    "edit",
    "delete",
    "bash",
    "gh",
    "notebook_edit",
    "create",
    "mkdir",
    "auto-bash",
    "auto-python",
    "auto-html",
    "jerry",
    "swarm",
]);
function emptyUsage() {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
function addUsage(total, usage) {
    const reasoningTokens = usage.reasoningTokens === undefined
        ? total.reasoningTokens
        : (total.reasoningTokens ?? 0) + usage.reasoningTokens;
    const cacheHitTokens = usage.cacheHitTokens === undefined
        ? total.cacheHitTokens
        : (total.cacheHitTokens ?? 0) + usage.cacheHitTokens;
    return {
        inputTokens: total.inputTokens + usage.inputTokens,
        outputTokens: total.outputTokens + usage.outputTokens,
        totalTokens: total.totalTokens + usage.totalTokens,
        ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
        ...(cacheHitTokens === undefined ? {} : { cacheHitTokens }),
    };
}
function resolvePermissionMode(config, preserveLegacyBehavior) {
    if (config.runtimeSettings?.managedPermissionMode)
        return config.runtimeSettings.managedPermissionMode.replace(/^default$/, "ask");
    if (config.dangerouslySkipPermissions)
        return "bypassPermissions";
    if (config.permissionMode)
        return config.permissionMode;
    // Existing injected whole-response executors historically ran without a
    // policy mode. Preserve that test/integration seam only; real execution is
    // fail-closed by default.
    return preserveLegacyBehavior ? "bypassPermissions" : "ask";
}
function safeParseNativeArguments(raw) {
    if (!raw.trim())
        return { args: {} };
    try {
        const parsed = JSON.parse(raw);
        if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
            return { args: {}, error: "Native tool arguments must be a JSON object." };
        }
        return { args: parsed };
    }
    catch (error) {
        return {
            args: {},
            error: `Invalid native tool arguments: ${error.message}`,
        };
    }
}
function argumentTarget(args, toolName) {
    // The structured git tool takes no arguments and performs a read-only status.
    if (toolName === "git" && Object.keys(args).length === 0)
        return "";
    if (toolName?.startsWith("mcp__")) {
        try {
            return JSON.stringify(stableValue(args));
        }
        catch {
            return "";
        }
    }
    const preferred = [
        "command",
        "filePath",
        "dirPath",
        "url",
        "query",
        "pattern",
        "taskId",
        "raw",
    ];
    for (const key of preferred) {
        const value = args[key];
        if (typeof value === "string")
            return value;
    }
    try {
        return JSON.stringify(args);
    }
    catch {
        return "";
    }
}
function stableValue(value) {
    if (Array.isArray(value))
        return value.map(stableValue);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, stableValue(nested)]));
    }
    return value;
}
function invocationSignature(invocations) {
    return JSON.stringify(invocations.map(({ invocation }) => ({
        name: invocation.name,
        args: stableValue(invocation.args),
        parseError: invocation.parseError,
    })));
}
function invocationIdentity(invocation) {
    return JSON.stringify({
        name: invocation.name,
        args: stableValue(invocation.args),
        parseError: invocation.parseError,
    });
}
function deniedResult(invocation, reason) {
    return {
        tool: invocation.name,
        result: `Permission denied: ${reason}`,
        success: false,
    };
}
function errorResult(invocation, reason) {
    return { tool: invocation.name, result: reason, success: false };
}
function normalizeApproval(response) {
    return typeof response === "boolean" ? { approved: response } : response;
}
async function resolveApprovalWithAbort(callback, request, signal) {
    if (signal?.aborted)
        return { aborted: true };
    if (!signal) {
        return { aborted: false, response: await callback(request) };
    }
    let onAbort;
    const aborted = new Promise((resolve) => {
        onAbort = () => resolve({ aborted: true });
        signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
        return await Promise.race([
            Promise.resolve(callback(request)).then((response) => ({ aborted: false, response })),
            aborted,
        ]);
    }
    finally {
        if (onAbort)
            signal.removeEventListener("abort", onAbort);
    }
}
/**
 * Run the agentic loop to completion. The input message array is never mutated.
 * All executors are reached only after a final allow decision.
 */
export async function runAgent(messages, config, cwd, options = {}) {
    const maxTurns = resolveTurnLimit(options.maxTurns ?? config.maxTurns);
    const streamFn = options.streamFn ?? realStreamChat;
    const textToolExecFn = options.textToolExecFn ?? realExecuteToolCall;
    const nativeToolExecFn = options.nativeToolExecFn ?? realExecuteNativeToolCall;
    const signal = options.signal;
    const permittedTools = options.toolAllowlist && config.toolAllowlist
        ? options.toolAllowlist.filter((tool) => config.toolAllowlist.some((allowed) => canonicalToolName(allowed) === canonicalToolName(tool)))
        : options.toolAllowlist ?? config.toolAllowlist;
    const toolAllowlist = options.enableTools === false ? new Set() : permittedTools
        ? new Set(permittedTools.map(canonicalToolName))
        : undefined;
    const swarmEnabled = options.enableSwarm !== false && config.enableSwarm !== false
        && options.enableTools !== false && (!toolAllowlist || toolAllowlist.has("swarm"));
    const providerConfig = {
        ...config,
        ...(toolAllowlist ? { toolAllowlist: [...toolAllowlist] } : {}),
        enableSwarm: swarmEnabled,
    };
    const outputValidator = config.jsonSchema ? createOutputValidator(config.jsonSchema) : undefined;
    let conversation = messages.filter(m => !(m.contextKind === "knowledge" && isLearnedContext(m.content)));
    let learning;
    const advertiseSwarm = swarmEnabled && decidePermission("swarm", "", resolvePermissionMode(config, false), config.allowedTools, config.disallowedTools, config.askTools, config.disableBypassPermissions, cwd).decision !== "deny";
    providerConfig.enableSwarm = advertiseSwarm;
    const swarmInstruction = advertiseSwarm ? autonomousSwarmPrompt()
        : (options.enableSwarm === false || config.enableSwarm === false) && options.enableTools !== false
            ? "Du bist ein Worker. swarm steht hier nicht zur Verfügung; erledige die Teilaufgabe selbst mit den erlaubten Werkzeugen."
            : "";
    // Capabilities belong only in the request; resumed transcripts stay unchanged.
    const providerMessages = () => {
        // Legacy transcripts can contain unfinished XML attempts as assistant text.
        // They are not tool evidence and otherwise teach the model to repeat the
        // broken protocol. Preserve the original only in the stored transcript.
        const request = conversation.map(message => message.role === "assistant" && !message.toolCalls?.length && isMalformedToolAttempt(message.content)
            ? { ...message, content: "[Frühere Assistant-Antwort enthielt unvollständige Tool-Syntax. Dies ist kein Werkzeugergebnis. Übernimm weder diese Aufrufe noch vermeintliche Messwerte daraus; verwende die aktuell angebotenen nativen Tools. Der Originaltext bleibt im gespeicherten Verlauf.]", isError: true }
            : message);
        const mcp = options.enableTools === false ? "" : formatConnectedMCPToolsForPrompt();
        const addition = `\n\n<morningstar-work-style>\n${WORK_GUIDANCE}\n</morningstar-work-style>${swarmInstruction ? `\n\n<morningstar-swarm>\n${swarmInstruction}\n</morningstar-swarm>` : ""}\n\n${mcp || "Keine MCP-Tools verbunden. Skills und Vault-Notizen installieren keine Werkzeuge; erfinde keine MCP-Namen."}\nWenn native Tools angeboten werden, verwende diese; andernfalls vollständige <tool:NAME>...</tool>-Tags. Gib einen Tool-Aufruf niemals als bloßen Antworttext aus. Antworte in der Sprache des Nutzers. Nach einer Statusabfrage nenne die gemessenen Werte und ihren Zeitstempel.`;
        if (request[0]?.role === "system")
            return [{ ...request[0], content: stripGeneratedMCPPrompt(request[0].content) + addition }, ...request.slice(1)];
        return [{ role: "system", content: addition.trim() }, ...request];
    };
    if (config.jsonSchema) {
        const instruction = `Return your final answer as JSON matching this JSON Schema. Do not wrap it in prose.\n${config.jsonSchema}`;
        if (conversation[0]?.role === "system")
            conversation[0] = { ...conversation[0], content: conversation[0].content + "\n\n" + instruction };
        else
            conversation.unshift({ role: "system", content: instruction });
    }
    let finalText = "";
    const toolCalls = [];
    let usage = emptyUsage();
    let costUsd = 0;
    let delegatedUsage = emptyUsage();
    let delegatedCostUsd = 0;
    let budgetExceeded = false;
    let turns = 0;
    let hitTurnLimit = false;
    let loopDetected = false;
    let previousInvocationSignature = "";
    let previousStableResult = "";
    let unchangedReadBatches = 0;
    let protocolRepairs = 0;
    let toolProtocolError;
    const emit = (event) => {
        if (event.type === "tool_result")
            learning?.observe(event.result, typeof event.invocation.args.command === "string" ? event.invocation.args.command : undefined);
        if (event.type === "backend_activity" && event.activity.result)
            learning?.observe(event.activity.result);
        options.onEvent?.(event);
        switch (event.type) {
            case "turn_start":
                options.onTurnStart?.(event.turn);
                break;
            case "tool_requested":
                options.onToolRequested?.(event.invocation, event.turn);
                break;
            case "approval_required":
                options.onApprovalRequired?.(event.request);
                break;
            case "approval_decision":
                options.onApprovalDecision?.(event.decision);
                break;
            case "usage":
                options.onUsage?.(event.usage, event.turn);
                break;
            default:
                break;
        }
    };
    const complete = (aborted) => {
        const structured = outputValidator && !aborted && !hitTurnLimit && !budgetExceeded && !loopDetected ? outputValidator(finalText) : undefined;
        const result = {
            finalText: finalText.trim(),
            messages: [...conversation],
            ...(structured?.error ? { structuredOutputError: structured.error } : structured ? { structuredOutput: structured.value } : {}),
            turns,
            toolCalls,
            usage,
            costUsd,
            ...(delegatedUsage.totalTokens || delegatedCostUsd ? { delegatedUsage, delegatedCostUsd } : {}),
            budgetExceeded,
            aborted,
            hitTurnLimit,
            loopDetected,
            ...(toolProtocolError ? { toolProtocolError } : {}),
        };
        try {
            const learned = learning?.finish(!aborted && !budgetExceeded && !hitTurnLimit && !loopDetected && !toolProtocolError);
            if (learned?.length)
                result.learned = learned;
        }
        catch { /* Learning cannot block the task. */ }
        emit({ type: "completion", result });
        options.onComplete?.(result);
        return result;
    };
    const hooks = config.runtimeSettings?.trustedHooks;
    const promptHook = await runRuntimeHooks(hooks, "UserPromptSubmit", { cwd, session_id: config.sessionId, prompt: messages.filter((m) => m.role === "user").at(-1)?.content }, signal);
    if (!promptHook.allowed) {
        finalText = promptHook.messages.join("\n");
        return complete(true);
    }
    if (config.selfImprovement === true && !config.noSessionPersistence && options.enableTools !== false && options.enableSwarm !== false && !signal?.aborted) {
        try {
            learning = new ActiveLearning(cwd, messages.filter(m => m.role === "user" && !m.contextKind).at(-1)?.content ?? "");
            const context = learning.context();
            if (context) {
                let taskIndex = conversation.length;
                for (let i = conversation.length - 1; i >= 0; i--)
                    if (conversation[i].role === "user" && !conversation[i].contextKind) {
                        taskIndex = i;
                        break;
                    }
                conversation.splice(Math.max(0, taskIndex), 0, { role: "user", contextKind: "knowledge", content: context });
            }
        }
        catch { /* Unavailable or malformed local learning is optional context. */ }
    }
    if (promptHook.messages.length)
        conversation.push({ role: "user", contextKind: "knowledge", content: `Hook context:\n${promptHook.messages.join("\n")}` });
    if (config.autoKnowledge && options.enableTools !== false && !signal?.aborted) {
        const beforeKnowledge = conversation.length;
        const allowed = async (tool, command) => {
            if (toolAllowlist && !toolAllowlist.has(tool))
                return false;
            if (decidePermission(tool, command, resolvePermissionMode(config, false), config.allowedTools, config.disallowedTools, config.askTools, config.disableBypassPermissions, cwd).decision !== "allow")
                return false;
            const hook = await runRuntimeHooks(hooks, "PreToolUse", { cwd, session_id: config.sessionId,
                tool_name: tool, tool_input: { command } }, signal);
            if (hook.messages.length)
                conversation.push({ role: "user", contextKind: "knowledge", content: `Knowledge hook context:\n${hook.messages.join("\n")}` });
            return hook.allowed;
        };
        const filterResult = async (tool, command, result) => {
            const hook = await runRuntimeHooks(hooks, "PostToolUse", { cwd, session_id: config.sessionId,
                tool_name: tool, tool_input: { command }, tool_response: result }, signal);
            return hook.allowed ? [result, ...hook.messages].join("\n") : `Knowledge result blocked by hook: ${hook.messages.join("\n")}`;
        };
        try {
            conversation.push(...await (options.knowledgeFn ?? prepareKnowledge)({ cwd,
                query: messages.filter((m) => m.role === "user" && !m.contextKind).at(-1)?.content ?? "", signal, allowed, filterResult }));
        }
        catch (error) {
            if (signal?.aborted)
                return complete(true);
            throw error;
        }
        const context = conversation.splice(beforeKnowledge);
        let taskIndex = conversation.length;
        for (let i = conversation.length - 1; i >= 0; i--) {
            if (conversation[i].role === "user" && !conversation[i].contextKind) {
                taskIndex = i;
                break;
            }
        }
        // Keep the actual task last, after lower-trust reference material.
        conversation.splice(taskIndex, 0, ...context);
    }
    for (let turnIndex = 0; turnIndex < maxTurns; turnIndex++) {
        if (signal?.aborted)
            return complete(true);
        if (config.maxBudgetUsd !== undefined
            && (options.initialCostUsd ?? 0) + costUsd >= config.maxBudgetUsd) {
            budgetExceeded = true;
            if (!finalText)
                finalText = "Budget-Limit erreicht.";
            return complete(false);
        }
        const turn = turnIndex + 1;
        turns = turn;
        emit({ type: "turn_start", turn });
        let response = "";
        const nativeCalls = new Map();
        let anonymousNativeCall = 0;
        try {
            // `true` is intentional: every supporting provider should expose native
            // tools to the canonical runner.
            for await (const token of streamFn(compactRequest(providerMessages(), config.contextChars).messages, providerConfig, signal, options.enableTools ?? true)) {
                if (signal?.aborted)
                    return complete(true);
                if (token.type === "backend_activity" && token.activity) {
                    emit({ type: "backend_activity", turn, activity: token.activity });
                    if (token.activity.result && !["error", "todo_list"].includes(token.activity.result.tool)) {
                        toolCalls.push(token.activity.result);
                        options.onTool?.(token.activity.result);
                    }
                }
                else if (token.type === "content") {
                    response += token.text;
                    options.onContent?.(token.text);
                    emit({ type: "content_delta", turn, delta: token.text });
                }
                else if (token.type === "reasoning") {
                    options.onReasoning?.(token.text);
                    emit({ type: "reasoning_delta", turn, delta: token.text });
                }
                else if (token.type === "usage" && token.usage) {
                    usage = addUsage(usage, token.usage);
                    costUsd += getCostPerMessage(config.model, token.usage.inputTokens, token.usage.outputTokens, config.provider);
                    emit({ type: "usage", turn, usage: token.usage });
                    if (config.maxBudgetUsd !== undefined
                        && (options.initialCostUsd ?? 0) + costUsd >= config.maxBudgetUsd) {
                        budgetExceeded = true;
                        break;
                    }
                }
                else if (token.type === "tool_call" && token.toolCall) {
                    const call = token.toolCall;
                    const key = call.id || `${call.name}:${anonymousNativeCall++}`;
                    const existing = nativeCalls.get(key);
                    if (existing) {
                        nativeCalls.set(key, {
                            ...existing,
                            name: call.name || existing.name,
                            arguments: existing.arguments + call.arguments,
                        });
                    }
                    else {
                        nativeCalls.set(key, {
                            id: call.id || `native-${turn}-${anonymousNativeCall}`,
                            name: call.name,
                            arguments: call.arguments,
                        });
                    }
                }
            }
        }
        catch (error) {
            if (signal?.aborted || error.name === "AbortError")
                return complete(true);
            throw error;
        }
        if (signal?.aborted) {
            if (response)
                finalText = response;
            return complete(true);
        }
        if (budgetExceeded) {
            finalText = response || "Budget-Limit erreicht.";
            return complete(false);
        }
        const parsedText = parseToolCalls(response);
        if (isMalformedToolAttempt(parsedText.cleanResponse)) {
            // Ask the model to correct its protocol. Never execute or guess a broken
            // call, never resolve a fabricated MCP alias to a similarly named tool.
            const retry = options.enableTools !== false && protocolRepairs < 2 && turnIndex < maxTurns - 1;
            const text = retry
                ? "Unvollständiger Werkzeugaufruf erkannt; Morningstar fordert einen gültigen Aufruf an."
                : "Werkzeugaufruf fehlgeschlagen: Das Modell lieferte wiederholt einen unvollständigen Aufruf. Dieser wurde nicht ausgeführt und lieferte keine Messwerte.";
            conversation.push({ role: "assistant", content: response });
            if (retry) {
                protocolRepairs++;
                const names = getOpenAIToolDefinitions(toolAllowlist ? [...toolAllowlist] : undefined, advertiseSwarm).map(tool => tool.function.name);
                conversation.push({ role: "user", contextKind: "tool-feedback", content: `Dein letzter Tool-Aufruf war unvollständig und wurde NICHT ausgeführt. Verwende einen nativen Function-Call mit einem EXAKT angebotenen Namen: ${names.join(", ")}. Wenn native Tools fehlen: <tool:NAME>Argumente</tool> vollständig schließen. Erfinde keine MCP-Namen aus Skills. Ist das benötigte Tool nicht verfügbar, erkläre das ehrlich in normalem Text. Für Live-Status zuerst wirklich messen, dann Werte und Zeitstempel ausgeben.` });
            }
            else {
                toolProtocolError = text;
                finalText = text;
                conversation.push({ role: "assistant", content: text, isError: true });
            }
            options.onTurnEnd?.(text, []);
            emit({ type: "turn_end", turn, text, tools: [] });
            if (retry)
                continue;
            break;
        }
        finalText = parsedText.cleanResponse || (parsedText.calls.length === 0 ? response : "");
        const parsedInvocations = parsedText.calls.map((call, index) => ({
            invocation: {
                id: `text-${turn}-${index + 1}`,
                name: call.tool.toLowerCase(),
                args: call.args,
                source: "text",
                raw: call.raw,
                parseError: call.error,
            },
            parsedCall: call,
        }));
        for (const native of nativeCalls.values()) {
            const parsed = safeParseNativeArguments(native.arguments);
            parsedInvocations.push({
                invocation: {
                    id: native.id,
                    name: native.name.toLowerCase(),
                    args: parsed.args,
                    source: "native",
                    raw: native.arguments,
                    parseError: parsed.error,
                },
            });
        }
        // Weak models invent a tool for replying (`<tool:answer>`, `final_answer`,
        // …). That call IS the answer: unwrap it as text instead of failing it as
        // an unknown tool, which would burn the turn and invite the same invention
        // again next turn.
        const answerInvocations = parsedInvocations.filter(({ invocation }) => invocation.source !== "legacy" && isFinalAnswerTool(invocation.name));
        if (answerInvocations.length > 0) {
            const answered = answerInvocations
                .map(({ invocation }) => extractFinalAnswerText(invocation.args))
                .filter(Boolean)
                .join("\n\n");
            if (answered)
                finalText = finalText ? `${finalText}\n\n${answered}` : answered;
        }
        const toolInvocations = answerInvocations.length === 0
            ? parsedInvocations
            : parsedInvocations.filter(({ invocation }) => invocation.source === "legacy" || !isFinalAnswerTool(invocation.name));
        // Providers can occasionally emit the same action as both a fallback
        // <tool:...> tag and a native function call. Run that exact action once,
        // retaining the native invocation so its provider call id gets a result.
        const nativeInvocationIdentities = new Set(toolInvocations
            .filter(({ invocation }) => invocation.source === "native")
            .map(({ invocation }) => invocationIdentity(invocation)));
        const pending = toolInvocations.filter(({ invocation }) => invocation.source !== "text"
            || !nativeInvocationIdentities.has(invocationIdentity(invocation)));
        // Compatibility discovery for injected whole-response executors. Standard
        // calls never need this path because they were parsed above.
        const useOpaqueLegacyExecutor = options.toolExecFn !== undefined
            && pending.length === 0
            && answerInvocations.length === 0;
        if (useOpaqueLegacyExecutor) {
            pending.push({
                invocation: {
                    id: `legacy-${turn}`,
                    name: "legacy",
                    args: { raw: response },
                    source: "legacy",
                    raw: response,
                },
            });
        }
        const signature = invocationSignature(pending);
        const canDetectLoop = pending.some(({ invocation }) => invocation.source !== "legacy"
            && (LOOP_SENSITIVE_TOOLS.has(invocation.name)
                || invocation.name.startsWith("mcp__")));
        if (canDetectLoop
            && pending.length > 0
            && signature === previousInvocationSignature) {
            loopDetected = true;
            const loopResults = pending.map(({ invocation }) => {
                emit({ type: "tool_requested", turn, invocation });
                const result = errorResult(invocation, "Loop detected: identical tool invocation repeated in consecutive turns.");
                toolCalls.push(result);
                options.onTool?.(result);
                emit({ type: "tool_result", turn, invocation, result });
                return result;
            });
            options.onTurnEnd?.(finalText, loopResults);
            emit({ type: "turn_end", turn, text: finalText, tools: loopResults });
            break;
        }
        previousInvocationSignature =
            canDetectLoop && pending.length > 0 ? signature : "";
        const turnResults = [];
        const nativeResults = [];
        const invocationResults = [];
        for (const item of pending) {
            if (signal?.aborted)
                return complete(true);
            const { invocation } = item;
            emit({ type: "tool_requested", turn, invocation });
            const verdict = budgetExceeded
                ? { decision: "deny", risk: "high", reason: "shared run budget exceeded" }
                : (invocation.name === "swarm" && !swarmEnabled) || (toolAllowlist && !toolAllowlist.has(invocation.name))
                    ? {
                        decision: "deny",
                        risk: "high",
                        reason: `tool "${invocation.name}" is outside the active agent allowlist`,
                    }
                    : decidePermission(invocation.name, argumentTarget(invocation.args, invocation.name), resolvePermissionMode(config, options.toolExecFn !== undefined && invocation.source !== "native"), config.allowedTools, config.disallowedTools, config.askTools, config.disableBypassPermissions, cwd);
            let approved = verdict.decision === "allow";
            let approvalDecision;
            if (verdict.decision === "ask") {
                const request = { turn, invocation, verdict };
                emit({ type: "approval_required", request });
                if (!options.onApproval) {
                    approvalDecision = {
                        turn,
                        invocation,
                        decision: "deny",
                        source: "missing_callback",
                        reason: "approval required but no approval callback was provided",
                    };
                }
                else {
                    try {
                        const approval = await resolveApprovalWithAbort(options.onApproval, request, signal);
                        if (approval.aborted) {
                            approvalDecision = {
                                turn,
                                invocation,
                                decision: "deny",
                                source: "user",
                                reason: "agent run aborted while awaiting approval",
                            };
                            emit({ type: "approval_decision", decision: approvalDecision });
                            return complete(true);
                        }
                        const answer = normalizeApproval(approval.response);
                        approved = answer.approved;
                        approvalDecision = {
                            turn,
                            invocation,
                            decision: approved ? "allow" : "deny",
                            source: "user",
                            reason: answer.reason
                                ?? (approved ? "approved by callback" : "denied by callback"),
                        };
                    }
                    catch (error) {
                        approved = false;
                        approvalDecision = {
                            turn,
                            invocation,
                            decision: "deny",
                            source: "user",
                            reason: `approval callback failed: ${error.message}`,
                        };
                    }
                }
            }
            else {
                approvalDecision = {
                    turn,
                    invocation,
                    decision: verdict.decision,
                    source: "policy",
                    reason: verdict.reason,
                };
            }
            emit({ type: "approval_decision", decision: approvalDecision });
            if (signal?.aborted)
                return complete(true);
            let results;
            if (!approved) {
                results = [deniedResult(invocation, approvalDecision.reason)];
            }
            else if (invocation.parseError) {
                results = [errorResult(invocation, invocation.parseError)];
            }
            else {
                let toolStarted;
                try {
                    const hook = await runRuntimeHooks(hooks, "PreToolUse", { cwd, session_id: config.sessionId, tool_name: invocation.name, tool_input: invocation.args }, signal);
                    if (!hook.allowed)
                        throw new Error(hook.messages.join("\n") || "Blocked by PreToolUse hook");
                    toolStarted = performance.now();
                    if (invocation.name === "swarm") {
                        const delegated = await executeAutonomousSwarm(`swarm-${turn}-${invocation.id}`, invocation.args, conversation, { ...providerConfig, permissionMode: resolvePermissionMode(config, options.toolExecFn !== undefined) }, cwd, { ...options, signal }, (options.initialCostUsd ?? 0) + costUsd, emit);
                        delegatedUsage = addUsage(delegatedUsage, delegated.usage);
                        delegatedCostUsd += delegated.costUsd;
                        costUsd += delegated.costUsd;
                        if (config.maxBudgetUsd !== undefined && (options.initialCostUsd ?? 0) + costUsd >= config.maxBudgetUsd)
                            budgetExceeded = true;
                        results = [delegated.result];
                    }
                    else if (invocation.source === "native") {
                        results = [
                            await Promise.resolve(nativeToolExecFn(invocation.name, invocation.args, cwd, signal)),
                        ];
                    }
                    else if (options.toolExecFn) {
                        const legacy = await options.toolExecFn(invocation.source === "legacy"
                            ? response
                            : (invocation.raw ?? ""), cwd);
                        results = legacy.results;
                        if (invocation.source === "legacy" && legacy.cleanResponse) {
                            finalText = legacy.cleanResponse;
                        }
                    }
                    else {
                        results = [
                            await Promise.resolve(textToolExecFn(item.parsedCall, cwd, signal)),
                        ];
                    }
                }
                catch (error) {
                    results = [
                        errorResult(invocation, `Tool execution failed: ${error.message}`),
                    ];
                }
                // Legacy executors can return several tools at once. Do not present the
                // batch duration as an individual tool's time.
                if (toolStarted !== undefined && results.length === 1) {
                    results = [{ ...results[0], durationMs: results[0].durationMs ?? Math.max(0, performance.now() - toolStarted) }];
                }
            }
            if (signal?.aborted)
                return complete(true);
            if (approved && !invocation.parseError && results.length) {
                const hook = await runRuntimeHooks(hooks, results.every((r) => r.success) ? "PostToolUse" : "PostToolUseFailure", { cwd, session_id: config.sessionId, tool_name: invocation.name, tool_input: invocation.args, tool_response: results }, signal);
                if (hook.messages.length || !hook.allowed) {
                    results = results.map((result, index) => index === results.length - 1
                        ? { ...result, success: result.success && hook.allowed, result: `${result.result}\n\nHook context:\n${hook.messages.join("\n")}` }
                        : result);
                }
            }
            for (const result of results) {
                turnResults.push(result);
                invocationResults.push({ invocation, result });
                toolCalls.push(result);
                if (invocation.source === "native") {
                    nativeResults.push({ invocation, result });
                }
                options.onTool?.(result);
                emit({ type: "tool_result", turn, invocation, result });
            }
        }
        if (turnResults.length === 0)
            finalText = scopeStatusConclusion(finalText, toolCalls);
        options.onTurnEnd?.(finalText, turnResults);
        emit({ type: "turn_end", turn, text: finalText, tools: turnResults });
        if (turnResults.length === 0) {
            conversation = [...conversation, { role: "assistant", content: finalText }];
            break;
        }
        const toolFeedback = turnResults
            .map((result) => `[Tool: ${result.tool}] ${result.success ? "Success" : "Error"}: ${result.result}`)
            .join("\n\n");
        const nativeResultIds = new Set(nativeResults.map(({ invocation }) => invocation.id));
        const nativeAssistant = nativeResults.length > 0
            ? [{
                    role: "assistant",
                    content: parsedText.cleanResponse,
                    toolCalls: pending
                        .filter(({ invocation }) => invocation.source === "native"
                        && nativeResultIds.has(invocation.id))
                        .map(({ invocation }) => ({
                        id: invocation.id,
                        name: invocation.name,
                        arguments: invocation.args,
                    })),
                }]
            : [{ role: "assistant", content: response }];
        const nativeToolMessages = nativeResults.map(({ invocation, result }) => ({
            role: "tool",
            content: result.result,
            toolCallId: invocation.id,
            toolName: invocation.name,
            isError: !result.success,
        }));
        const textResults = invocationResults
            .filter(({ invocation }) => invocation.source !== "native")
            .map(({ result }) => result);
        const continuationPrompt = "Continue the task. Only call more tools if necessary, otherwise give "
            + "a short final summary of what you did.";
        const textFeedback = textResults.length > 0
            ? [{
                    role: "user",
                    contextKind: "tool-feedback",
                    content: `Tool results:\n${textResults
                        .map((result) => `[Tool: ${result.tool}] ${result.success ? "Success" : "Error"}: ${result.result}`)
                        .join("\n\n")}\n\n${continuationPrompt}`,
                }]
            : nativeResults.length === 0
                ? [{
                        role: "user",
                        contextKind: "tool-feedback",
                        content: `Tool results:\n${toolFeedback}\n\n${continuationPrompt}`,
                    }]
                : [];
        conversation = [
            ...conversation,
            ...nativeAssistant,
            ...nativeToolMessages,
            ...textFeedback,
        ];
        // Read-only/unknown calls may repeat while their output changes (polling).
        // Three identical requests with identical outcomes indicate no progress.
        const stableResult = JSON.stringify({ signature, results: turnResults.map(({ durationMs: _timing, ...outcome }) => outcome) });
        unchangedReadBatches = !canDetectLoop && stableResult === previousStableResult ? unchangedReadBatches + 1 : 1;
        previousStableResult = stableResult;
        if (!canDetectLoop && pending.every(({ invocation }) => invocation.source !== "legacy") && unchangedReadBatches >= 3) {
            loopDetected = true;
            finalText ||= "Kein Fortschritt: dieselben Werkzeugaufrufe lieferten dreimal unveränderte Ergebnisse.";
            break;
        }
        if (turnIndex === maxTurns - 1)
            hitTurnLimit = true;
    }
    const stop = await runRuntimeHooks(hooks, "Stop", { cwd, session_id: config.sessionId, reason: hitTurnLimit ? "turn_limit" : "complete" }, signal);
    if (!stop.allowed) {
        finalText += `\n${stop.messages.join("\n")}`;
        return complete(true);
    }
    return complete(false);
}
//# sourceMappingURL=agent-runner.js.map