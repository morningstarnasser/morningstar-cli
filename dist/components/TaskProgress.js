import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
// ─── Status Icons ────────────────────────────────────────
const STATUS_ICON = {
    completed: "\u2714", // ✔
    in_progress: "\u25FC", // ◼
    pending: "\u25FB", // ◻
    failed: "\u2718", // ✘
};
const STATUS_COLOR = {
    completed: "#34d399", // green
    in_progress: "#60a5fa", // blue
    pending: "#6b7280", // gray
    failed: "#f87171", // red
};
// ─── Tool Colors ─────────────────────────────────────────
const TOOL_COLORS = {
    read: "#60a5fa",
    write: "#34d399",
    edit: "#fbbf24",
    delete: "#f87171",
    bash: "#a78bfa",
    grep: "#38bdf8",
    glob: "#38bdf8",
    ls: "#94a3b8",
    git: "#fb923c",
    web: "#2dd4bf",
    fetch: "#2dd4bf",
    gh: "#e879f9",
};
// ─── Spinner Frames ──────────────────────────────────────
const SPINNER_FRAMES = ["\u2733", "\u2734", "\u2733", "\u2734"]; // ✳ ✴
export function TaskProgress({ steps, currentLabel, startTime, tokenCount, turnNumber, maxTurns }) {
    const { dim, info, accent } = useTheme();
    const [frame, setFrame] = useState(0);
    const [elapsed, setElapsed] = useState("0.0s");
    useEffect(() => {
        const interval = setInterval(() => {
            setFrame(f => (f + 1) % SPINNER_FRAMES.length);
            const secs = (Date.now() - startTime) / 1000;
            if (secs >= 60) {
                const mins = Math.floor(secs / 60);
                const remSecs = Math.round(secs % 60);
                setElapsed(`${mins}m ${remSecs}s`);
            }
            else {
                setElapsed(`${secs.toFixed(1)}s`);
            }
        }, 250);
        return () => clearInterval(interval);
    }, [startTime]);
    const tokenStr = tokenCount >= 1000
        ? `${(tokenCount / 1000).toFixed(1)}k`
        : String(tokenCount);
    const completedCount = steps.filter(s => s.status === "completed").length;
    const failedCount = steps.filter(s => s.status === "failed").length;
    const totalCount = steps.length;
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsxs(Box, { children: [_jsxs(Text, { color: accent, bold: true, children: [SPINNER_FRAMES[frame], " "] }), _jsx(Text, { bold: true, children: currentLabel }), totalCount > 0 && (_jsxs(Text, { color: dim, children: [" (", completedCount, "/", totalCount, ")"] }))] }), steps.map((step) => {
                const icon = STATUS_ICON[step.status];
                const iconColor = STATUS_COLOR[step.status];
                const toolColor = TOOL_COLORS[step.tool] || "#94a3b8";
                return (_jsxs(Box, { children: [_jsxs(Text, { color: iconColor, children: [" ", icon, " "] }), _jsx(Text, { color: step.status === "pending" ? dim : toolColor, bold: step.status === "in_progress", children: step.label }), step.detail && (_jsxs(Text, { color: dim, children: [" ", step.detail] })), step.duration != null && step.status === "completed" && (_jsxs(Text, { color: dim, children: [" (", (step.duration / 1000).toFixed(1), "s)"] }))] }, step.id));
            }), _jsxs(Box, { marginTop: 0, children: [_jsxs(Text, { color: dim, children: ["  ", elapsed, " \u00B7 \\u2193 ", tokenStr, " tokens \u00B7 Turn ", turnNumber, "/", maxTurns] }), failedCount > 0 && (_jsxs(Text, { color: "#f87171", children: [" \u00B7 ", failedCount, " failed"] }))] })] }));
}
// ─── Helper: Create step from tool call ──────────────────
const TOOL_LABELS = {
    read: "Read",
    write: "Write",
    edit: "Update",
    delete: "Delete",
    bash: "Bash",
    "auto-bash": "Bash",
    grep: "Search",
    glob: "Glob",
    ls: "List",
    git: "Git",
    web: "WebSearch",
    fetch: "Fetch",
    gh: "GitHub",
};
export function createTaskStep(tool, args, status = "pending") {
    const label = TOOL_LABELS[tool] || tool;
    const argPreview = args.length > 40 ? args.slice(0, 37) + "..." : args;
    return {
        id: `${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: `${label}(${argPreview})`,
        tool,
        status,
    };
}
//# sourceMappingURL=TaskProgress.js.map