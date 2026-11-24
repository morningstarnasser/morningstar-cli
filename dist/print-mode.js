import { randomUUID } from "node:crypto";
import { readPrintInput } from "./print-input.js";
import { saveConversation } from "./history.js";
import { runRuntimeHooks } from "./runtime-hooks.js";
import { runAgent, } from "./agent-runner.js";
/** Convert internal lifecycle events to the stable NDJSON print contract. */
export function toPrintStreamEvent(event) {
    switch (event.type) {
        case "backend_activity":
        case "swarm_start":
        case "swarm_progress":
        case "swarm_activity":
        case "swarm_end":
            return event;
        case "turn_start":
            return event;
        case "content_delta":
            return { type: "content", turn: event.turn, text: event.delta };
        case "reasoning_delta":
            return { type: "reasoning", turn: event.turn, text: event.delta };
        case "tool_requested":
            return event;
        case "approval_required":
            return {
                type: "approval_required",
                turn: event.request.turn,
                invocation: event.request.invocation,
                verdict: event.request.verdict,
            };
        case "approval_decision":
            return {
                type: "approval_decision",
                turn: event.decision.turn,
                invocation: event.decision.invocation,
                decision: event.decision.decision,
                source: event.decision.source,
                reason: event.decision.reason,
            };
        case "tool_result":
            return {
                type: "tool",
                turn: event.turn,
                invocation: event.invocation,
                tool: event.result.tool,
                result: event.result.result,
                success: event.result.success,
            };
        case "usage":
            return event;
        case "turn_end":
            return {
                type: "turn_end",
                turn: event.turn,
                text: event.text,
                toolCount: event.tools.length,
            };
        case "completion":
            return completionEvent(event.result);
    }
}
function completionEvent(result) {
    return {
        type: "completion",
        result: result.finalText,
        turns: result.turns,
        toolCount: result.toolCalls.length,
        usage: result.usage,
        aborted: result.aborted,
        hitTurnLimit: result.hitTurnLimit,
        loopDetected: result.loopDetected,
        ...(result.structuredOutput !== undefined ? { structured_output: result.structuredOutput } : {}),
        ...(result.structuredOutputError ? { structured_output_error: result.structuredOutputError } : {}),
        ...(result.toolProtocolError ? { tool_protocol_error: result.toolProtocolError } : {}),
    };
}
export function printExitCode(result) {
    if (result.aborted)
        return 130;
    return result.toolProtocolError || result.structuredOutputError || result.hitTurnLimit || result.loopDetected || result.budgetExceeded || result.toolCalls.some((tool) => !tool.success) ? 1 : 0;
}
export async function runPrintMode(prompt, systemPrompt, config, cwd, resumedMessages = [], io = {}) {
    const format = config.outputFormat || "text";
    const write = io.write ?? ((text) => { process.stdout.write(text); });
    const input = io.input ?? (!process.stdin.isTTY ? process.stdin : undefined);
    const sessionId = config.sessionId ?? randomUUID();
    let messages = [{ role: "system", content: systemPrompt }, ...resumedMessages.filter((m) => m.role !== "system")];
    let exitCode = 0;
    let processed = 0;
    let spent = 0;
    const controller = new AbortController();
    const interrupt = () => controller.abort();
    process.once("SIGINT", interrupt);
    const run = async (content) => {
        if (!content.trim())
            return;
        processed++;
        if (processed > 100)
            throw new Error("Maximum 100 input messages per print session");
        messages.push({ role: "user", content });
        const result = await runAgent(messages, { ...config, sessionId }, cwd, {
            ...io.runnerOptions,
            signal: controller.signal,
            initialCostUsd: spent,
            maxTurns: config.maxTurns,
            enableTools: config.toolAllowlist?.length === 0 ? false : io.runnerOptions?.enableTools,
            onEvent: format === "stream-json" ? (event) => write(`${JSON.stringify(toPrintStreamEvent(event))}\n`) : undefined,
        });
        spent += result.costUsd ?? 0;
        messages = result.messages ?? [...messages, { role: "assistant", content: result.finalText }];
        exitCode = Math.max(exitCode, printExitCode(result));
        if (!config.noSessionPersistence)
            saveConversation(config.sessionName || content.slice(0, 80), messages, config.model, cwd, sessionId);
        if (format === "json")
            write(`${JSON.stringify({ result: result.finalText, session_id: sessionId, model: config.model, is_error: printExitCode(result) !== 0, turns: result.turns, cost: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }, cost_usd: result.costUsd, budget_exceeded: result.budgetExceeded, structured_output: result.structuredOutput, structured_output_error: result.structuredOutputError })}\n`);
        else if (format === "text")
            write(`${result.finalText}\n`);
    };
    try {
        const start = await runRuntimeHooks(config.runtimeSettings?.trustedHooks, "SessionStart", { cwd, session_id: sessionId, reason: resumedMessages.length ? "resume" : "startup" }, controller.signal);
        if (!start.allowed)
            throw new Error(start.messages.join("\n"));
        if (start.messages.length)
            messages.push({ role: "user", content: `Session hook context:\n${start.messages.join("\n")}` });
        if (config.inputFormat === "stream-json") {
            if (format !== "stream-json")
                throw new Error("stream-json input requires stream-json output");
            if (prompt)
                await run(prompt);
            if (input)
                for await (const content of readPrintInput(input, "stream-json")) {
                    await run(content);
                    if (exitCode)
                        break;
                }
        }
        else {
            let content = "";
            if (input)
                for await (const part of readPrintInput(input, "text"))
                    content += part;
            await run([content, prompt].filter(Boolean).join("\n\n"));
        }
        if (!processed)
            throw new Error("No prompt or input supplied");
        const end = await runRuntimeHooks(config.runtimeSettings?.trustedHooks, "SessionEnd", { cwd, session_id: sessionId, reason: exitCode ? "error" : "complete" }, controller.signal);
        if (!end.allowed)
            exitCode ||= 1;
        if (!io.write)
            process.exitCode = exitCode;
        return exitCode;
    }
    finally {
        process.removeListener("SIGINT", interrupt);
    }
}
//# sourceMappingURL=print-mode.js.map