import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function countCodeTokens(content) {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const matches = content.match(codeBlockRegex);
    if (!matches)
        return 0;
    return matches.reduce((sum, block) => sum + estimateTokens(block), 0);
}
export function ContextRadar({ messages, maxTokens = 128000 }) {
    let systemTokens = 0;
    let chatTokens = 0;
    let codeTokens = 0;
    let toolTokens = 0;
    for (const msg of messages) {
        const content = msg.content || "";
        const tokens = estimateTokens(content);
        if (content.includes("[Tool:")) {
            toolTokens += tokens;
        }
        else if (msg.role === "system") {
            systemTokens += tokens;
        }
        else if (msg.role === "user") {
            chatTokens += tokens;
        }
        else if (msg.role === "assistant") {
            const codeInMsg = countCodeTokens(content);
            codeTokens += codeInMsg;
            chatTokens += Math.max(0, tokens - codeInMsg);
        }
    }
    const usedTokens = systemTokens + chatTokens + codeTokens + toolTokens;
    const usagePct = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
    const sysPct = Math.round((systemTokens / maxTokens) * 100);
    const chatPct = Math.round((chatTokens / maxTokens) * 100);
    const codePct = Math.round((codeTokens / maxTokens) * 100);
    const toolPct = Math.round((toolTokens / maxTokens) * 100);
    const freePct = Math.max(0, 100 - sysPct - chatPct - codePct - toolPct);
    // Bar: 20 chars wide
    const barWidth = 20;
    const filled = Math.round((usagePct / 100) * barWidth);
    const empty = barWidth - filled;
    const filledBar = "\u2588".repeat(filled);
    const emptyBar = "\u2591".repeat(empty);
    // Color by usage level
    const barColor = usagePct < 60 ? "#34d399" : usagePct < 80 ? "#fbbf24" : usagePct < 95 ? "#fb923c" : "#f87171";
    const warn = usagePct >= 85;
    return (_jsxs(Box, { children: [_jsx(Text, { color: "gray", children: "\u25D0 " }), _jsx(Text, { color: "white", bold: true, children: "Context " }), _jsx(Text, { color: "gray", children: "[" }), _jsx(Text, { color: barColor, children: filledBar }), _jsxs(Text, { color: "gray", children: [emptyBar, "] "] }), _jsxs(Text, { color: barColor, bold: true, children: [usagePct, "%"] }), warn && _jsx(Text, { color: "#f87171", children: " \u26A0" }), _jsx(Text, { color: "gray", children: " \u00B7 " }), _jsxs(Text, { color: "gray", children: ["Sys ", sysPct, "%"] }), _jsx(Text, { color: "gray", children: " \u00B7 " }), _jsxs(Text, { color: "#60a5fa", children: ["Chat ", chatPct, "%"] }), _jsx(Text, { color: "gray", children: " \u00B7 " }), _jsxs(Text, { color: "#34d399", children: ["Code ", codePct, "%"] }), _jsx(Text, { color: "gray", children: " \u00B7 " }), _jsxs(Text, { color: "#fbbf24", children: ["Tools ", toolPct, "%"] }), _jsx(Text, { color: "gray", children: " \u00B7 " }), _jsxs(Text, { color: "gray", dimColor: true, children: ["Free ", freePct, "%"] })] }));
}
//# sourceMappingURL=ContextRadar.js.map