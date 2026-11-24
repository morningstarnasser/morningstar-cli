import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { fitText } from "../tui-layout.js";
import { useTerminalDetail } from "../hooks/useTerminalDetails.js";
import { useMemo } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { displayText, fileChange, workHeading } from "../runtime/work-log.js";
const GREEN = "#7bd88f", RED = "#ff7d7d", BODY = "#b5beca", COMMAND = "#a8c8fa";
function Counts({ added, removed }) {
    return _jsxs(Text, { children: ["(", _jsxs(Text, { color: GREEN, children: ["+", added] }), " ", _jsxs(Text, { color: RED, children: ["-", removed] }), ")"] });
}
/** Static, selectable factual output. Only the running status area animates. */
export function WorkLog({ results, agent }) {
    const t = useTheme();
    const entries = useMemo(() => results.map(r => ({ r, change: r.success && r.diff ? fileChange(r.diff.oldStr, r.diff.newStr, r.startLineNumber) : undefined })), [results]);
    const edits = entries.filter(e => e.change);
    const files = new Set(edits.map(e => e.r.filePath ?? e.r.diff.filePath)).size;
    return _jsxs(Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1, children: [edits.length ? _jsxs(Text, { children: [_jsxs(Text, { bold: true, color: GREEN, children: ["\u2022 Edited ", files, " file", files === 1 ? "" : "s", " "] }), _jsx(Counts, { added: edits.reduce((n, e) => n + e.change.added, 0), removed: edits.reduce((n, e) => n + e.change.removed, 0) }), agent ? _jsxs(Text, { color: t.dim, children: [" \u00B7 ", displayText(agent)] }) : null] }) : null, entries.map(({ r }, index) => _jsx(WorkEntry, { result: r, agent: agent }, index))] });
}
function WorkEntry({ result: r, agent }) {
    const t = useTheme(), columns = useTerminalColumns();
    const change = useMemo(() => r.success && r.diff ? fileChange(r.diff.oldStr, r.diff.newStr, r.startLineNumber, 8) : undefined, [r]);
    const full = useMemo(() => {
        if (!r.diff)
            return displayText(r.result);
        const diff = fileChange(r.diff.oldStr, r.diff.newStr, r.startLineNumber, Number.MAX_SAFE_INTEGER);
        return diff.lines.map(line => `${line.kind === "added" ? "\x1b[38;2;123;216;143;48;2;0;95;0m+" : line.kind === "removed" ? "\x1b[38;2;255;125;125;48;2;95;0;0m-" : " "} ${String(line.line).padStart(4)} ${displayText(line.text)}\x1b[0m`).join("\n") + "\n\n" + displayText(r.result);
    }, [r]);
    const detail = useTerminalDetail({ title: displayText(workHeading(r)), body: full });
    return _jsxs(Box, { flexDirection: "column", children: [change ? _jsxs(_Fragment, { children: [_jsxs(Text, { children: [_jsx(Text, { color: t.dim, children: "  \u2514 " }), displayText(r.filePath ?? r.diff.filePath), " ", _jsx(Counts, { added: change.added, removed: change.removed })] }), change.lines.map((line, i) => _jsx(Text, { wrap: "truncate", backgroundColor: line.kind === "added" ? "#005f00" : line.kind === "removed" ? "#5f0000" : undefined, color: line.kind === "added" ? GREEN : line.kind === "removed" ? RED : t.dim, children: fitText(`    ${String(line.line).padStart(4)} ${line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "} ${displayText(line.text)}`, Math.max(20, columns - 4)).padEnd(Math.max(20, columns - 4)) }, i)), change.omitted ? _jsxs(Text, { color: t.dim, children: ["    \u2026 ", change.omitted, " weitere Diff-Zeilen"] }) : null, change.coarse ? _jsx(Text, { color: t.dim, children: "    Grosse \u00C4nderung: ersetzten Bereich vollst\u00E4ndig gez\u00E4hlt." }) : null] }) : _jsxs(_Fragment, { children: [_jsxs(Text, { wrap: "truncate", children: [_jsxs(Text, { bold: true, color: r.success ? GREEN : RED, children: ["\u2022 ", r.command ? displayText(workHeading(r).slice(0, -r.command.length)) : displayText(workHeading(r))] }), r.command ? _jsx(Text, { color: COMMAND, children: fitText(displayText(r.command), Math.max(20, columns - 32)) }) : null, agent ? _jsxs(Text, { color: t.dim, children: [" \u00B7 ", displayText(agent)] }) : null] }), (r.tool === "swarm" ? [r.success ? "Team abgeschlossen; Berichte an Hauptagent übergeben." : "Team mit Fehlern; Hauptagent erhält Details."] : displayText(r.result).split("\n")).slice(0, 4).map((line, i) => _jsxs(Text, { wrap: "truncate", children: [_jsx(Text, { color: t.dim, children: i === 0 ? "  └ " : "    " }), _jsx(Text, { color: r.success ? BODY : RED, children: fitText(line, Math.max(20, columns - 8)) || " " })] }, i)), r.tool !== "swarm" && r.result.split("\n").length > 4 ? _jsxs(Text, { color: t.dim, children: ["    \u2026 ", r.result.split("\n").length - 4, " weitere Ausgabezeilen"] }) : null] }), detail ? _jsxs(Text, { color: GREEN, children: ["    ", detail] }) : null] });
}
//# sourceMappingURL=WorkLog.js.map