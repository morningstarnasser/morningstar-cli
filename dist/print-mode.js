import { runAgent, } from "./agent-runner.js";
/** Convert internal lifecycle events to the stable NDJSON print contract. */
export function toPrintStreamEvent(event) {
    switch (event.type) {
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
    };
}
export async function runPrintMode(prompt, systemPrompt, config, cwd) {
    const format = config.outputFormat || "text";
    const maxTurns = config.maxTurns ?? 5;
    // Read stdin if available (pipe-friendly)
    let stdinContent = "";
    if (!process.stdin.isTTY) {
        stdinContent = await readStdin();
    }
    const userContent = stdinContent
        ? `${stdinContent}\n\n${prompt}`
        : prompt;
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
    ];
    const result = await runAgent(messages, config, cwd, {
        maxTurns,
        onEvent: format === "stream-json"
            ? (event) => {
                process.stdout.write(`${JSON.stringify(toPrintStreamEvent(event))}\n`);
            }
            : undefined,
    });
    if (format === "json") {
        const output = {
            result: result.finalText,
            model: config.model,
            cost: {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
            },
        };
        process.stdout.write(`${JSON.stringify(output)}\n`);
    }
    else if (format === "text") {
        process.stdout.write(`${result.finalText}\n`);
    }
    process.exit(0);
}
function readStdin() {
    return new Promise((resolve) => {
        let data = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", (chunk) => {
            data += chunk;
        });
        process.stdin.on("end", () => resolve(data));
        // Timeout after 100ms of no data for non-pipe scenarios
        setTimeout(() => resolve(data), 100);
    });
}
//# sourceMappingURL=print-mode.js.map