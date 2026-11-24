import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { displayText, fileChange } from "../runtime/work-log.js";
/** Shared bounded diff for legacy tool panels and inline edits. */
export function ClaudeCodeDiff({ oldStr, newStr, filePath, startLineNumber = 1, maxLines = 40 }) {
    const t = useTheme();
    const change = useMemo(() => fileChange(oldStr, newStr, startLineNumber, maxLines), [oldStr, newStr, startLineNumber, maxLines]);
    return _jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsxs(Text, { children: [_jsx(Text, { color: t.dim, children: "\u2514 " }), filePath ? `${displayText(filePath)} ` : "", "(", _jsxs(Text, { color: "#7bd88f", children: ["+", change.added] }), " ", _jsxs(Text, { color: "#ff7d7d", children: ["-", change.removed] }), ")"] }), change.lines.map((line, index) => _jsx(Text, { wrap: "wrap", color: line.kind === "added" ? "#7bd88f" : line.kind === "removed" ? "#ff7d7d" : t.dim, children: `${String(line.line).padStart(4)} ${line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "} ${displayText(line.text).slice(0, 600)}` }, index)), change.omitted ? _jsxs(Text, { color: t.dim, children: ["\u2026 ", change.omitted, " weitere Diff-Zeilen"] }) : null, change.coarse ? _jsx(Text, { color: t.dim, children: "Grosse \u00C4nderung: ersetzten Bereich vollst\u00E4ndig gez\u00E4hlt." }) : null] });
}
//# sourceMappingURL=ClaudeCodeDiff.js.map