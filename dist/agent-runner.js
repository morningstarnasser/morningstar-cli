// ─── Shared Headless Agentic Engine ──────────────────────────────────────────
// Canonical model -> authorization -> tool -> feedback loop used by every
// non-interactive runtime. Provider-native and text tool calls are normalized
// into the same invocation contract before policy evaluation.
import { streamChat as realStreamChat } from "./ai.js";
import { executeNativeToolCall as realExecuteNativeToolCall, executeToolCall as realExecuteToolCall, parseToolCalls, } from "./tools.js";
import { decidePermission } from "./policy-engine.js";
import { getCostPerMessage } from "./cost-tracker.js";
const DEFAULT_MAX_TURNS = 12;
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
    const maxTurns = Math.max(0, options.maxTurns ?? config.maxTurns ?? DEFAULT_MAX_TURNS);
    const streamFn = options.streamFn ?? realStreamChat;
    const textToolExecFn = options.textToolExecFn ?? realExecuteToolCall;
    const nativeToolExecFn = options.nativeToolExecFn ?? realExecuteNativeToolCall;
    const signal = options.signal;
    const toolAllowlist = options.toolAllowlist
        ? new Set(options.toolAllowlist.map((tool) => tool.toLowerCase()))
        : undefined;
    let conversation = [...messages];
    let finalText = "";
    const toolCalls = [];
    let usage = emptyUsage();
    let costUsd = 0;
    let budgetExceeded = false;
    let turns = 0;
    let hitTurnLimit = false;
    let loopDetected = false;
    let previousInvocationSignature = "";
    const emit = (event) => {
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
        const result = {
            finalText: finalText.trim(),
            turns,
            toolCalls,
            usage,
            costUsd,
            budgetExceeded,
            aborted,
            hitTurnLimit,
            loopDetected,
        };
        emit({ type: "completion", result });
        options.onComplete?.(result);
        return result;
    };
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
            for await (const token of streamFn(conversation, config, signal, options.enableTools ?? true)) {
                if (signal?.aborted)
                    return complete(true);
                if (token.type === "content") {
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
        // Providers can occasionally emit the same action as both a fallback
        // <tool:...> tag and a native function call. Run that exact action once,
        // retaining the native invocation so its provider call id gets a result.
        const nativeInvocationIdentities = new Set(parsedInvocations
            .filter(({ invocation }) => invocation.source === "native")
            .map(({ invocation }) => invocationIdentity(invocation)));
        const pending = parsedInvocations.filter(({ invocation }) => invocation.source !== "text"
            || !nativeInvocationIdentities.has(invocationIdentity(invocation)));
        // Compatibility discovery for injected whole-response executors. Standard
        // calls never need this path because they were parsed above.
        const useOpaqueLegacyExecutor = options.toolExecFn !== undefined && pending.length === 0;
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
            const verdict = toolAllowlist && !toolAllowlist.has(invocation.name)
                ? {
                    decision: "deny",
                    risk: "high",
                    reason: `tool "${invocation.name}" is outside the active agent allowlist`,
                }
                : decidePermission(invocation.name, argumentTarget(invocation.args, invocation.name), resolvePermissionMode(config, options.toolExecFn !== undefined && invocation.source !== "native"), config.allowedTools, config.disallowedTools);
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
                try {
                    if (invocation.source === "native") {
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
            }
            if (signal?.aborted)
                return complete(true);
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
        options.onTurnEnd?.(finalText, turnResults);
        emit({ type: "turn_end", turn, text: finalText, tools: turnResults });
        if (turnResults.length === 0)
            break;
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
                    content: `Tool results:\n${textResults
                        .map((result) => `[Tool: ${result.tool}] ${result.success ? "Success" : "Error"}: ${result.result}`)
                        .join("\n\n")}\n\n${continuationPrompt}`,
                }]
            : nativeResults.length === 0
                ? [{
                        role: "user",
                        content: `Tool results:\n${toolFeedback}\n\n${continuationPrompt}`,
                    }]
                : [];
        conversation = [
            ...conversation,
            ...nativeAssistant,
            ...nativeToolMessages,
            ...textFeedback,
        ];
        if (turnIndex === maxTurns - 1)
            hitTurnLimit = true;
    }
    return complete(false);
}
//# sourceMappingURL=agent-runner.js.map