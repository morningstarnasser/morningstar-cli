import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { ClaudeCodeDiff } from "./ClaudeCodeDiff.js";
// Tool display names — Claude Code style
const TOOL_LABELS = {
    read: "Read",
    write: "Write",
    edit: "Update",
    delete: "Delete",
    bash: "Bash",
    "auto-bash": "Bash",
    "auto-python": "Python",
    grep: "Search",
    glob: "Glob",
    ls: "List",
    git: "Git",
    web: "WebSearch",
    fetch: "Fetch",
    gh: "GitHub",
    create: "Create",
    mkdir: "Create",
};
// Tool icons for each type
const TOOL_COLORS = {
    read: "#60a5fa", // blue
    write: "#34d399", // green
    edit: "#fbbf24", // amber
    delete: "#f87171", // red
    bash: "#a78bfa", // purple
    grep: "#38bdf8", // sky
    glob: "#38bdf8", // sky
    ls: "#94a3b8", // slate
    git: "#fb923c", // orange
    web: "#2dd4bf", // teal
    fetch: "#2dd4bf", // teal
    gh: "#e879f9", // fuchsia
};
function getToolArg(tool, filePath, command, result) {
    if (filePath)
        return filePath;
    if (command) {
        // Truncate long commands
        const short = command.length > 50 ? command.slice(0, 47) + "..." : command;
        return short;
    }
    // Try to extract path/query from result
    if (tool === "grep" || tool === "web") {
        const first = result?.split("\n")[0]?.slice(0, 40) || "";
        return first;
    }
    return "";
}
function getSummary(tool, result, success, linesChanged, filePath) {
    if (!success) {
        // Extract meaningful error
        const msg = result.split("\n")[0]?.replace(/^(Fehler|Error):\s*/i, "") || "Failed";
        return msg.length > 80 ? msg.slice(0, 77) + "..." : msg;
    }
    switch (tool) {
        case "read":
            return `${linesChanged || "?"} lines`;
        case "write":
            return `Wrote ${linesChanged || "?"} lines`;
        case "edit": {
            return `Updated${linesChanged ? ` ${linesChanged} lines` : ""}`;
        }
        case "delete":
            return `Deleted`;
        case "bash":
        case "auto-bash":
        case "auto-python": {
            const lines = result.split("\n").filter(l => l.trim());
            if (lines.length === 0)
                return "(no output)";
            if (lines.length === 1)
                return lines[0].length > 80 ? lines[0].slice(0, 77) + "..." : lines[0];
            return `${lines[0].slice(0, 60)}${lines.length > 1 ? ` (+${lines.length - 1} lines)` : ""}`;
        }
        case "grep": {
            const matches = result.split("\n").filter(l => l.trim()).length;
            return matches === 0 ? "No matches" : `${matches} matches`;
        }
        case "glob": {
            const files = result.split("\n").filter(l => l.trim()).length;
            return files === 0 ? "No files found" : `${files} files`;
        }
        case "ls": {
            const entries = result.split("\n").filter(l => l.trim()).length;
            return `${entries} entries`;
        }
        case "git":
        case "gh":
        case "web":
        case "fetch": {
            const first = result.split("\n")[0]?.slice(0, 70) || "";
            return first;
        }
        default:
            return result.split("\n")[0]?.slice(0, 70) || "";
    }
}
// Tools that show full multi-line output (like Claude Code)
const FULL_OUTPUT_TOOLS = new Set(["bash", "auto-bash", "auto-python", "grep", "glob", "ls", "git", "web", "fetch"]);
const MAX_OUTPUT_LINES = 25;
export function ToolResult({ tool, result, success, diff, filePath, linesChanged, command, startLineNumber }) {
    const { primary, error, dim } = useTheme();
    const label = TOOL_LABELS[tool] || tool;
    const toolColor = success ? (TOOL_COLORS[tool] || primary) : error;
    const arg = getToolArg(tool, filePath, command, result);
    const showFullOutput = FULL_OUTPUT_TOOLS.has(tool);
    const lines = result.split("\n");
    // For edit diffs, compute a better summary
    const hasDiff = diff && tool === "edit" && diff.oldStr && diff.newStr;
    let diffSummary = "";
    if (hasDiff) {
        const addedLines = diff.newStr.split("\n").length;
        const removedLines = diff.oldStr.split("\n").length;
        diffSummary = `Added ${addedLines} line${addedLines !== 1 ? "s" : ""}, removed ${removedLines} line${removedLines !== 1 ? "s" : ""}`;
    }
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsxs(Text, { children: [_jsx(Text, { color: toolColor, bold: true, children: "⏺ " }), _jsx(Text, { color: toolColor, bold: true, children: label }), arg && _jsxs(Text, { color: dim, children: ["(", arg, ")"] })] }), success && showFullOutput && lines.length > 0 ? (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [_jsx(Text, { color: dim, children: "  ⎿  " }), _jsx(Text, { children: lines[0] })] }), lines.slice(1, MAX_OUTPUT_LINES).map((line, i) => (_jsxs(Text, { children: [_jsx(Text, { children: "     " }), _jsx(Text, { children: line || " " })] }, i))), lines.length > MAX_OUTPUT_LINES && (_jsxs(Text, { children: [_jsx(Text, { children: "     " }), _jsx(Text, { color: dim, children: `… (+${lines.length - MAX_OUTPUT_LINES} lines)` })] }))] })) : success && hasDiff ? (
            /* Claude Code-style inline diff for edit tool */
            _jsx(ClaudeCodeDiff, { oldStr: diff.oldStr, newStr: diff.newStr, startLineNumber: startLineNumber || 1 })) : success && !showFullOutput ? (
            /* Short summary for file tools (read/write/delete) */
            _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "  ⎿  " }), _jsx(Text, { children: getSummary(tool, result, success, linesChanged, filePath) })] })) : !success ? (
            /* Error output */
            _jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [_jsx(Text, { color: dim, children: "  ⎿  " }), _jsx(Text, { color: error, children: lines[0] })] }), lines.slice(1, 10).map((line, i) => (_jsxs(Text, { children: [_jsx(Text, { children: "     " }), _jsx(Text, { color: error, children: line || " " })] }, i))), lines.length > 10 && (_jsxs(Text, { children: [_jsx(Text, { children: "     " }), _jsx(Text, { color: dim, children: `… (+${lines.length - 10} lines)` })] }))] })) : null] }));
}
//# sourceMappingURL=ToolResult.js.map