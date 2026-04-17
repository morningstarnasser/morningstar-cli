import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getTheme } from "../theme.js";
import { getTodoStats } from "../todo.js";
import { loadMemories } from "../memory.js";
import { getAllAgents } from "../custom-agents.js";
const STAR_FRAMES = ["✦", "✧", "⋆", "✧"];
const TITLE = "MORNINGSTAR";
function useGlyphAnimation(intervalMs) {
    const [idx, setIdx] = useState(0);
    useEffect(() => {
        if (!process.stdout.isTTY)
            return;
        const id = setInterval(() => setIdx((i) => (i + 1) % STAR_FRAMES.length), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return STAR_FRAMES[idx];
}
// Gradient chars for title — copper → amber → cream
function titleGradient(primary, accent, star) {
    // Use theme's own primary/accent/star so gradient matches the picked theme.
    const palette = [primary, primary, accent, accent, star, star, star, accent, accent, primary, primary];
    return palette;
}
function Row({ children }) {
    return _jsx(Box, { marginLeft: 1, children: children });
}
export function Banner({ config, ctx, skipPermissions }) {
    const { primary, accent, info, dim, success, warning, star } = useTheme();
    const theme = getTheme();
    const provider = config.provider || detectProvider(config.model);
    const modelName = getModelDisplayName(config.model);
    const permissionMode = skipPermissions ? "bypass" : getPermissionMode();
    const settingsState = projectSettingsExist(ctx.cwd) ? "active" : "none";
    const todoStats = getTodoStats();
    const memoryCount = loadMemories().length;
    const agentCount = Object.keys(getAllAgents()).length;
    const languageLabel = ctx.language
        ? `${ctx.language}${ctx.framework ? ` / ${ctx.framework}` : ""}`
        : "unknown";
    const glyph = useGlyphAnimation(650);
    const gradient = titleGradient(primary, accent, star);
    const rule = "─".repeat(58);
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, marginBottom: 1, children: [_jsxs(Box, { children: [_jsxs(Text, { color: star, children: ["  ", glyph, "  "] }), TITLE.split("").map((ch, i) => (_jsxs(Text, { color: gradient[i % gradient.length], bold: true, children: [ch, i < TITLE.length - 1 ? " " : ""] }, i))), _jsx(Text, { color: dim, children: "   \u00B7 independent coding cli" })] }), _jsx(Row, { children: _jsx(Text, { color: dim, children: rule }) }), _jsxs(Row, { children: [_jsx(Text, { color: dim, children: "project " }), _jsx(Text, { color: primary, children: ctx.projectName }), _jsx(Text, { color: dim, children: "  \u00B7  stack " }), _jsx(Text, { color: info, children: languageLabel }), _jsx(Text, { color: dim, children: "  \u00B7  branch " }), _jsx(Text, { color: ctx.hasGit ? success : dim, children: ctx.gitBranch || "—" })] }), _jsxs(Row, { children: [_jsx(Text, { color: dim, children: "model   " }), _jsx(Text, { color: primary, children: modelName }), _jsx(Text, { color: dim, children: "  \u00B7  provider " }), _jsx(Text, { color: info, children: provider }), _jsx(Text, { color: dim, children: "  \u00B7  theme " }), _jsx(Text, { color: warning, children: theme.name })] }), _jsxs(Row, { children: [_jsx(Text, { color: dim, children: "state   " }), _jsx(Text, { color: settingsState === "active" ? success : dim, children: settingsState }), _jsx(Text, { color: dim, children: "  \u00B7  perms " }), _jsx(Text, { color: skipPermissions ? warning : info, children: permissionMode }), _jsx(Text, { color: dim, children: "  \u00B7  agents " }), _jsx(Text, { color: primary, children: agentCount }), (todoStats.open > 0 || memoryCount > 0) && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), todoStats.open > 0 ? (_jsxs(Text, { color: warning, children: [todoStats.open, " todos "] })) : null, memoryCount > 0 ? (_jsxs(Text, { color: info, children: [memoryCount, " memories"] })) : null] }))] }), _jsx(Row, { children: _jsx(Text, { color: dim, children: rule }) }), _jsxs(Row, { children: [_jsx(Text, { color: dim, children: "tip " }), _jsx(Text, { color: accent, children: "/help" }), _jsx(Text, { color: dim, children: "  " }), _jsx(Text, { color: accent, children: "/model" }), _jsx(Text, { color: dim, children: "  " }), _jsx(Text, { color: accent, children: "/agents" }), _jsx(Text, { color: dim, children: "  " }), _jsx(Text, { color: accent, children: "/skills" }), _jsx(Text, { color: dim, children: "  " }), _jsx(Text, { color: accent, children: "/doctor" }), _jsx(Text, { color: dim, children: "  \u00B7  shift+tab" }), _jsx(Text, { color: dim, children: " cycles permission modes" })] })] }));
}
//# sourceMappingURL=Banner.js.map