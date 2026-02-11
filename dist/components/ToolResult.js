import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
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
export function ToolResult({ tool, result, success, diff, filePath, linesChanged, command }) {
    const { primary, success: successColor, error, warning, dim, accent } = useTheme();
    const label = TOOL_LABELS[tool] || tool;
    const toolColor = success ? (TOOL_COLORS[tool] || primary) : error;
    const arg = getToolArg(tool, filePath, command, result);
    const summary = getSummary(tool, result, success, linesChanged, filePath);
    const maxDiffLines = 12;
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsxs(Text, { children: [_jsx(Text, { color: toolColor, bold: true, children: "  ⏺ " }), _jsx(Text, { color: toolColor, bold: true, children: label }), arg && _jsxs(Text, { color: dim, children: ["(", arg, ")"] })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "    ⎿  " }), success ? (_jsx(Text, { children: summary })) : (_jsx(Text, { color: error, children: summary }))] }), diff && tool === "edit" && (_jsxs(Box, { flexDirection: "column", marginLeft: 6, children: [diff.oldStr.split("\n").slice(0, maxDiffLines).map((line, i) => (_jsx(Text, { children: _jsx(Text, { color: "#f87171", children: `      - ${line}` }) }, `old-${i}`))), diff.oldStr.split("\n").length > maxDiffLines && (_jsx(Text, { color: dim, children: `      ... (+${diff.oldStr.split("\n").length - maxDiffLines} lines)` })), diff.newStr.split("\n").slice(0, maxDiffLines).map((line, i) => (_jsx(Text, { children: _jsx(Text, { color: "#34d399", children: `      + ${line}` }) }, `new-${i}`))), diff.newStr.split("\n").length > maxDiffLines && (_jsx(Text, { color: dim, children: `      ... (+${diff.newStr.split("\n").length - maxDiffLines} lines)` }))] })), !diff && success && (tool === "bash" || tool === "auto-bash" || tool === "auto-python" || tool === "grep" || tool === "ls") && result.split("\n").length > 1 && (_jsxs(Box, { flexDirection: "column", marginLeft: 6, children: [result.split("\n").slice(0, 15).map((line, i) => (_jsx(Text, { color: dim, children: `      ${line}` }, i))), result.split("\n").length > 15 && (_jsx(Text, { color: dim, children: `      ... (+${result.split("\n").length - 15} lines)` }))] }))] }));
}
//# sourceMappingURL=ToolResult.js.map