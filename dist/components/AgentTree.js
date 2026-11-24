import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns, useTerminalRows } from "../hooks/useTerminalColumns.js";
import { fitText } from "../tui-layout.js";
import { motionEnabled } from "../runtime/motion.js";
const STATUS_ICON = {
    pending: "◻",
    running: "◼",
    completed: "✓",
    failed: "✘",
    cancelled: "⊘",
};
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
function formatElapsed(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60)
        return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    return `${m}m ${rem}s`;
}
export function AgentTree({ title, branches, startTime, done, elapsedMs }) {
    const { primary, dim, success, error, info, warning, accent } = useTheme();
    const [frame, setFrame] = useState(0);
    const columns = useTerminalColumns();
    const rows = useTerminalRows();
    const width = Math.max(16, columns - 8);
    const limit = Math.min(8, Math.max(2, Math.floor((rows - 17) / 2)));
    // Running tasks remain visible even when the plan has many queued dependents.
    const visible = [...branches.filter(b => b.status === "running"), ...branches.filter(b => b.status !== "running")].slice(0, limit);
    useEffect(() => {
        if (done || !motionEnabled())
            return;
        const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 150);
        return () => clearInterval(id);
    }, [done]);
    const running = branches.filter((b) => b.status === "running").length;
    const completed = branches.filter((b) => b.status === "completed").length;
    const failed = branches.filter((b) => b.status === "failed").length;
    const totalElapsed = done ? elapsedMs ?? Math.max(0, ...branches.map(b => b.elapsedMs)) : Date.now() - startTime;
    function statusColor(s) {
        switch (s) {
            case "completed":
                return success;
            case "failed":
                return error;
            case "running":
                return info;
            case "cancelled":
                return warning;
            default:
                return dim;
        }
    }
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, marginY: 1, children: [_jsxs(Text, { color: primary, bold: true, children: [_jsx(Text, { color: accent, children: done ? "✦ " : `${SPINNER[frame]} ` }), fitText(title, width)] }), _jsxs(Text, { color: dim, children: [branches.length, " tasks \u00B7 ", _jsxs(Text, { color: info, children: [running, " aktiv"] }), " \u00B7 ", _jsxs(Text, { color: success, children: [completed, " fertig"] }), failed ? _jsxs(Text, { color: error, children: [" \u00B7 ", failed, " fehlgeschlagen"] }) : null, " \u00B7 ", formatElapsed(totalElapsed)] }), _jsxs(Text, { color: dim, children: ["━".repeat(Math.round(Math.min(width, 36) * completed / Math.max(1, branches.length))), "─".repeat(Math.min(width, 36) - Math.round(Math.min(width, 36) * completed / Math.max(1, branches.length)))] }), visible.map((b, i) => {
                const isLast = i === visible.length - 1;
                const connector = isLast ? "└─" : "├─";
                const color = statusColor(b.status);
                return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [_jsxs(Text, { color: dim, children: ["  ", connector, " "] }), _jsxs(Text, { color: color, children: [STATUS_ICON[b.status], " "] }), _jsx(Text, { color: primary, bold: true, children: fitText(b.taskId ? `${b.taskId} · ${b.agentId}` : b.agentId, Math.max(10, width - 18)) }), _jsx(Text, { color: dim, children: "  " }), b.elapsedMs > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: dim, children: formatElapsed(b.elapsedMs) })] }))] }), _jsxs(Text, { color: b.status === "failed" ? error : dim, children: ["     ", fitText(b.detail.replace(/[\r\n\t]/g, " "), width - 5)] })] }, `${b.taskId || b.agentId}-${i}`));
            }), branches.length > visible.length ? _jsxs(Text, { color: dim, children: ["  + ", branches.length - visible.length, " weitere Tasks"] }) : null] }));
}
//# sourceMappingURL=AgentTree.js.map