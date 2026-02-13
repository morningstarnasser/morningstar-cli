import { streamChat } from "./ai.js";
import { executeToolCalls } from "./tools.js";
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
    if (format === "stream-json") {
        await runStreamJson(messages, config, cwd, maxTurns);
    }
    else {
        const result = await runChat(messages, config, cwd, maxTurns);
        if (format === "json") {
            const output = {
                result,
                model: config.model,
                cost: { inputTokens: 0, outputTokens: 0 },
            };
            process.stdout.write(JSON.stringify(output) + "\n");
        }
        else {
            process.stdout.write(result + "\n");
        }
    }
    process.exit(0);
}
async function runChat(messages, config, cwd, maxTurns) {
    let currentMessages = [...messages];
    let finalResponse = "";
    for (let turn = 0; turn < maxTurns; turn++) {
        let response = "";
        for await (const token of streamChat(currentMessages, config)) {
            if (token.type === "content")
                response += token.text;
        }
        finalResponse = response;
        // Try tool execution
        let toolResults = null;
        try {
            toolResults = await executeToolCalls(response, cwd);
        }
        catch { }
        if (!toolResults || toolResults.results.length === 0)
            break;
        // Feed tool results back
        const toolFeedback = toolResults.results
            .map(r => `[Tool: ${r.tool}] ${r.success ? "Success" : "Error"}: ${r.result}`)
            .join("\n\n");
        currentMessages = [
            ...currentMessages,
            { role: "assistant", content: response },
            { role: "user", content: `Tool results:\n${toolFeedback}\n\nSummarize what you did. Only execute more tools if necessary.` },
        ];
    }
    return finalResponse;
}
async function runStreamJson(messages, config, cwd, maxTurns) {
    let currentMessages = [...messages];
    for (let turn = 0; turn < maxTurns; turn++) {
        let response = "";
        for await (const token of streamChat(currentMessages, config)) {
            if (token.type === "content") {
                response += token.text;
                process.stdout.write(JSON.stringify({ type: "content", text: token.text }) + "\n");
            }
            else {
                process.stdout.write(JSON.stringify({ type: "reasoning", text: token.text }) + "\n");
            }
        }
        let toolResults = null;
        try {
            toolResults = await executeToolCalls(response, cwd);
        }
        catch { }
        if (!toolResults || toolResults.results.length === 0)
            break;
        for (const r of toolResults.results) {
            process.stdout.write(JSON.stringify({ type: "tool", tool: r.tool, result: r.result, success: r.success }) + "\n");
        }
        const toolFeedback = toolResults.results
            .map(r => `[Tool: ${r.tool}] ${r.success ? "Success" : "Error"}: ${r.result}`)
            .join("\n\n");
        currentMessages = [
            ...currentMessages,
            { role: "assistant", content: response },
            { role: "user", content: `Tool results:\n${toolFeedback}\n\nSummarize what you did. Only execute more tools if necessary.` },
        ];
    }
}
function readStdin() {
    return new Promise((resolve) => {
        let data = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", (chunk) => { data += chunk; });
        process.stdin.on("end", () => resolve(data));
        // Timeout after 100ms of no data for non-pipe scenarios
        setTimeout(() => resolve(data), 100);
    });
}
//# sourceMappingURL=print-mode.js.map