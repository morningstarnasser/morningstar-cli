import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { ClaudeCodeDiff } from "./ClaudeCodeDiff.js";
// Tool display names
const TOOL_LABELS = {
    read: "Read", write: "Write", edit: "Update", delete: "Delete",
    bash: "Bash", "auto-bash": "Bash", "auto-python": "Python",
    grep: "Search", glob: "Glob", ls: "List", git: "Git",
    web: "WebSearch", fetch: "Fetch", gh: "GitHub", create: "Create", mkdir: "Create",
};
const TOOL_COLORS = {
    read: "#60a5fa", write: "#34d399", edit: "#fbbf24", delete: "#f87171",
    bash: "#a78bfa", grep: "#38bdf8", glob: "#38bdf8", ls: "#94a3b8",
    git: "#fb923c", web: "#2dd4bf", fetch: "#2dd4bf", gh: "#e879f9",
};
function getToolArg(tool, filePath, command) {
    if (filePath)
        return filePath;
    if (command)
        return command.length > 50 ? command.slice(0, 47) + "..." : command;
    return "";
}
function getShortSummary(r) {
    if (!r.success)
        return r.result.split("\n")[0]?.slice(0, 60) || "Failed";
    switch (r.tool) {
        case "read": return `${r.linesChanged || "?"} lines`;
        case "write": return `${r.linesChanged || "?"} lines`;
        case "edit": {
            if (r.diff) {
                const added = r.diff.newStr.split("\n").length;
                const removed = r.diff.oldStr.split("\n").length;
                return `${added} added, ${removed} removed`;
            }
            return `${r.linesChanged ? r.linesChanged + " lines changed" : "updated"}`;
        }
        case "delete": return "Deleted";
        case "bash":
        case "auto-bash":
        case "auto-python": {
            const lines = r.result.split("\n").filter(l => l.trim());
            return lines.length === 0 ? "(no output)" : `${lines.length} lines output`;
        }
        case "grep": {
            const matches = r.result.split("\n").filter(l => l.trim()).length;
            return `${matches} matches`;
        }
        case "glob": {
            const files = r.result.split("\n").filter(l => l.trim()).length;
            return `${files} files`;
        }
        default: return "Done";
    }
}
// Limit output for full-output tools in expanded view
const MAX_EXPANDED_LINES = 8;
export function ToolGroup({ results, duration, tokenCount, expanded, label, toolUseCount }) {
    const { primary, dim, info, error } = useTheme();
    const durationStr = duration >= 60000
        ? `${Math.floor(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`
        : `${(duration / 1000).toFixed(1)}s`;
    const tokenStr = tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : String(tokenCount);
    if (!expanded) {
        // Collapsed view
        return (_jsx(Box, { flexDirection: "column", marginLeft: 2, children: _jsxs(Text, { children: [_jsx(Text, { color: info, bold: true, children: "⏺ " }), _jsxs(Text, { bold: true, children: [toolUseCount, " tool use", toolUseCount !== 1 ? "s" : ""] }), label && _jsxs(Text, { color: dim, children: [" \u2014 ", label] }), _jsx(Text, { color: dim, children: " (ctrl+o to expand)" })] }) }));
    }
    // Expanded tree view
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsxs(Text, { children: [_jsx(Text, { color: info, bold: true, children: "⏺ " }), _jsxs(Text, { bold: true, children: [toolUseCount, " tool use", toolUseCount !== 1 ? "s" : ""] }), label && _jsxs(Text, { color: dim, children: [" \u2014 ", label] })] }), results.map((r, i) => {
                const isLast = i === results.length - 1;
                const prefix = isLast ? "└─" : "├─";
                const continuePrefix = isLast ? "   " : "│  ";
                const toolLabel = TOOL_LABELS[r.tool] || r.tool;
                const toolColor = r.success ? (TOOL_COLORS[r.tool] || primary) : error;
                const arg = getToolArg(r.tool, r.filePath, r.command);
                const summary = getShortSummary(r);
                const hasDiff = r.tool === "edit" && r.diff && r.diff.oldStr && r.diff.newStr;
                // For bash/grep/glob etc, show a few output lines
                const isFullOutput = ["bash", "auto-bash", "auto-python", "grep", "glob", "ls", "git", "web", "fetch"].includes(r.tool);
                const outputLines = r.result.split("\n").filter(l => l.trim());
                return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [_jsxs(Text, { color: dim, children: ["   ", prefix, " "] }), _jsx(Text, { color: toolColor, bold: true, children: toolLabel }), arg && _jsxs(Text, { color: dim, children: ["(", arg, ")"] }), _jsxs(Text, { color: dim, children: [" \u00B7 ", summary] })] }), hasDiff ? (_jsxs(Box, { marginLeft: 3, flexDirection: "column", children: [_jsxs(Text, { color: dim, children: ["   ", continuePrefix] }), _jsx(Box, { marginLeft: 3, children: _jsx(ClaudeCodeDiff, { oldStr: r.diff.oldStr, newStr: r.diff.newStr, startLineNumber: r.startLineNumber || 1, maxLines: 20 }) })] })) : r.success && isFullOutput && outputLines.length > 0 ? (
                        /* Show a few output lines for bash/grep etc */
                        _jsxs(Box, { flexDirection: "column", children: [outputLines.slice(0, MAX_EXPANDED_LINES).map((line, li) => (_jsxs(Text, { children: [_jsxs(Text, { color: dim, children: ["   ", continuePrefix, "  "] }), _jsx(Text, { children: line })] }, li))), outputLines.length > MAX_EXPANDED_LINES && (_jsx(Text, { children: _jsxs(Text, { color: dim, children: ["   ", continuePrefix, "  \u2026 (+", outputLines.length - MAX_EXPANDED_LINES, " lines)"] }) }))] })) : (
                        /* Simple result line: │  ⎿  Done */
                        _jsxs(Text, { children: [_jsxs(Text, { color: dim, children: ["   ", continuePrefix, "\u23BF  "] }), _jsx(Text, { color: r.success ? undefined : error, children: r.success ? "Done" : r.result.split("\n")[0]?.slice(0, 60) || "Failed" })] }))] }, i));
            }), _jsxs(Text, { color: dim, children: ["   ", "(", durationStr, " \u00B7 \u2193 ", tokenStr, " tokens)"] })] }));
}
//# sourceMappingURL=ToolGroup.js.map