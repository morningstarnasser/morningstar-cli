import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getAllAgents } from "../custom-agents.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getTheme } from "../theme.js";
import { getTodoStats } from "../todo.js";
import { loadMemories } from "../memory.js";
// ─── Gradient Wave Block Letters ────────────────────────
// Jede Zeile des Block-Texts wird buchstabenweise eingefaerbt.
// Gradient: gold → amber → orange → rose → pink → fuchsia → purple
const GRADIENT_COLORS = [
    "#f59e0b", // gold
    "#d97706", // amber
    "#f97316", // orange
    "#f43f5e", // rose
    "#ec4899", // pink
    "#d946ef", // fuchsia
    "#a855f7", // purple
];
// Block-Buchstaben fuer "MORNING" (7 Buchstaben → 7 Farben)
const MORNING_LINES = [
    ["███╗   ███╗", " ██████╗ ", "██████╗ ", "███╗   ██╗", "██╗", "███╗   ██╗", " ██████╗ "],
    ["████╗ ████║", "██╔═══██╗", "██╔══██╗", "████╗  ██║", "██║", "████╗  ██║", "██╔════╝ "],
    ["██╔████╔██║", "██║   ██║", "██████╔╝", "██╔██╗ ██║", "██║", "██╔██╗ ██║", "██║  ███╗"],
    ["██║╚██╔╝██║", "██║   ██║", "██╔══██╗", "██║╚██╗██║", "██║", "██║╚██╗██║", "██║   ██║"],
    ["██║ ╚═╝ ██║", "╚██████╔╝", "██║  ██║", "██║ ╚████║", "██║", "██║ ╚████║", "╚██████╔╝"],
    ["╚═╝     ╚═╝", " ╚═════╝ ", "╚═╝  ╚═╝", "╚═╝  ╚═══╝", "╚═╝", "╚═╝  ╚═══╝", " ╚═════╝ "],
];
// Block-Buchstaben fuer "STAR" (4 Buchstaben)
const STAR_LINES = [
    ["███████╗", "████████╗", " █████╗ ", "██████╗ "],
    ["██╔════╝", "╚══██╔══╝", "██╔══██╗", "██╔══██╗"],
    ["███████╗", "   ██║   ", "███████║", "██████╔╝"],
    ["╚════██║", "   ██║   ", "██╔══██║", "██╔══██╗"],
    ["███████║", "   ██║   ", "██║  ██║", "██║  ██║"],
    ["╚══════╝", "   ╚═╝   ", "╚═╝  ╚═╝", "╚═╝  ╚═╝"],
];
// Gradient-Farben fuer STAR (4 Buchstaben, ab gold)
const STAR_COLORS = ["#f59e0b", "#d97706", "#f97316", "#f43f5e"];
export function Banner({ config, ctx, skipPermissions }) {
    const { primary, secondary, accent, info, dim, star } = useTheme();
    const theme = getTheme();
    const modelName = getModelDisplayName(config.model);
    const provDisplay = config.provider || detectProvider(config.model);
    const langInfo = ctx.language
        ? ctx.language + (ctx.framework ? " / " + ctx.framework : "")
        : "unbekannt";
    const cwdShort = ctx.cwd.length > 42 ? "..." + ctx.cwd.slice(-39) : ctx.cwd;
    const permLabel = skipPermissions ? "BYPASS" : getPermissionMode();
    const settingsTag = projectSettingsExist(ctx.cwd) ? "active" : "none";
    const allAgents = getAllAgents();
    const agentNames = Object.entries(allAgents).map(([id, a]) => ({ id, color: a.color }));
    const todoStats = getTodoStats();
    const memCount = loadMemories().length;
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Box, { flexDirection: "column", marginLeft: 3, children: [MORNING_LINES.map((segments, lineIdx) => (_jsxs(Text, { bold: true, children: ["  ", segments.map((seg, i) => (_jsx(Text, { color: GRADIENT_COLORS[i], children: seg }, i)))] }, `m-${lineIdx}`))), STAR_LINES.map((segments, lineIdx) => (_jsxs(Text, { bold: true, children: ["  ", segments.map((seg, i) => (_jsx(Text, { color: STAR_COLORS[i], children: seg }, i))), lineIdx === 1 && (_jsxs(Text, { children: ["   ", _jsx(Text, { color: "#ec4899", children: "Terminal AI Coding Assistant" })] })), lineIdx === 2 && (_jsxs(Text, { children: ["   ", _jsx(Text, { color: dim, children: "Powered by" }), " ", _jsx(Text, { color: accent, bold: true, children: "Mr.Morningstar" })] })), lineIdx === 3 && (_jsxs(Text, { children: ["   ", _jsx(Text, { color: info, children: "github.com/morningstarnasser" })] }))] }, `s-${lineIdx}`)))] }), _jsx(Box, { marginLeft: 2, marginTop: 1, children: _jsxs(Text, { color: primary, children: ["  ", "━".repeat(68)] }) }), _jsxs(Box, { flexDirection: "column", marginTop: 1, marginLeft: 2, borderStyle: "single", borderColor: dim, paddingX: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: primary, children: " \u2605 " }), _jsx(Text, { color: dim, children: "Model    " }), _jsx(Text, { color: info, children: modelName }), " ", _jsx(Text, { color: dim, children: "[" }), _jsx(Text, { color: accent, children: provDisplay }), _jsx(Text, { color: dim, children: "]" })] }), _jsxs(Text, { children: [_jsx(Text, { color: primary, children: " \u2605 " }), _jsx(Text, { color: dim, children: "Projekt  " }), _jsx(Text, { bold: true, children: ctx.projectName }), " ", _jsx(Text, { color: dim, children: "(" }), _jsx(Text, { children: langInfo }), _jsx(Text, { color: dim, children: ")" })] }), _jsxs(Text, { children: [_jsx(Text, { color: primary, children: " \u2605 " }), _jsx(Text, { color: dim, children: "Branch   " }), _jsx(Text, { color: accent, children: ctx.hasGit ? (ctx.gitBranch || "unknown") : "—" }), "   ", _jsx(Text, { color: primary, children: "\u2605 " }), _jsx(Text, { color: dim, children: "Perms  " }), skipPermissions ? _jsx(Text, { color: "#ef4444", bold: true, children: "BYPASS" }) : _jsx(Text, { color: dim, children: permLabel }), "   ", _jsx(Text, { color: primary, children: "\u2605 " }), _jsx(Text, { color: dim, children: "Theme  " }), _jsx(Text, { color: primary, children: theme.name })] }), _jsxs(Text, { children: [_jsx(Text, { color: primary, children: " \u2605 " }), _jsx(Text, { color: dim, children: "CWD      " }), _jsx(Text, { children: cwdShort }), "   ", _jsx(Text, { color: primary, children: "\u2605 " }), _jsx(Text, { color: dim, children: "Settings " }), settingsTag === "active" ? _jsx(Text, { color: "#10b981", children: "active" }) : _jsx(Text, { color: dim, children: "none" })] })] }), _jsxs(Box, { flexDirection: "column", marginTop: 1, marginLeft: 2, children: [_jsxs(Text, { children: [_jsx(Text, { color: dim, children: "  Tools   " }), _jsx(Text, { color: info, children: "read" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "write" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "edit" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "bash" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "grep" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "glob" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "ls" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "git" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "web" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "fetch" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: info, children: "gh" })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "  Agents  " }), agentNames.map((a, i) => (_jsxs(Text, { children: [i > 0 && _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: a.color, children: a.id })] }, a.id)))] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "  Hilfe   " }), _jsx(Text, { color: "#f0abfc", children: "/help" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: "#f0abfc", children: "/features" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: "#f0abfc", children: "/agents" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: "#f0abfc", children: "/agent:create" }), _jsx(Text, { color: dim, children: " \u00B7 " }), _jsx(Text, { color: "#f0abfc", children: "/quit" })] })] }), (todoStats.open > 0 || memCount > 0) && (_jsxs(Box, { flexDirection: "column", marginTop: 1, marginLeft: 4, children: [todoStats.open > 0 && (_jsxs(Text, { color: accent, children: ["  ", todoStats.open, " offene Aufgabe(n) ", _jsx(Text, { color: dim, children: "\u2014 /todo list" })] })), memCount > 0 && (_jsxs(Text, { color: info, children: ["  ", memCount, " Notiz(en) gespeichert ", _jsx(Text, { color: dim, children: "\u2014 /memory list" })] }))] })), _jsx(Box, { marginLeft: 2, marginTop: 1, children: _jsxs(Text, { color: dim, children: ["  ", "─".repeat(68)] }) })] }));
}
//# sourceMappingURL=Banner.js.map