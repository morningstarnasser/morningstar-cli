import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
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
export function AgentTree({ title, branches, startTime, done }) {
    const { primary, dim, success, error, info, warning, accent } = useTheme();
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        if (done)
            return;
        const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120);
        return () => clearInterval(id);
    }, [done]);
    const running = branches.filter((b) => b.status === "running").length;
    const completed = branches.filter((b) => b.status === "completed").length;
    const failed = branches.filter((b) => b.status === "failed").length;
    const totalElapsed = Date.now() - startTime;
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
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, marginY: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: accent, bold: true, children: done ? "✦ " : `${SPINNER[frame]} ` }), _jsx(Text, { color: primary, bold: true, children: title }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: info, children: branches.length }), _jsx(Text, { color: dim, children: " agents" }), running > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsxs(Text, { color: info, children: [running, " running"] })] })), completed > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsxs(Text, { color: success, children: [completed, " done"] })] })), failed > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsxs(Text, { color: error, children: [failed, " failed"] })] })), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: dim, children: formatElapsed(totalElapsed) })] }), branches.map((b, i) => {
                const isLast = i === branches.length - 1;
                const connector = isLast ? "└─" : "├─";
                const color = statusColor(b.status);
                return (_jsxs(Box, { children: [_jsxs(Text, { color: dim, children: ["  ", connector, " "] }), _jsxs(Text, { color: color, children: [STATUS_ICON[b.status], " "] }), _jsx(Text, { color: primary, bold: true, children: b.agentId }), _jsx(Text, { color: dim, children: "  " }), _jsx(Text, { color: b.status === "failed" ? error : dim, children: b.detail }), b.elapsedMs > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: dim, children: formatElapsed(b.elapsedMs) })] }))] }, `${b.agentId}-${i}`));
            })] }));
}
//# sourceMappingURL=AgentTree.js.map