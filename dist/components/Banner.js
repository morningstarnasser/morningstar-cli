import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getAllAgents } from "../custom-agents.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getTheme, getThemeId } from "../theme.js";
import { getTodoStats } from "../todo.js";
import { loadMemories } from "../memory.js";
export function Banner({ config, ctx, skipPermissions }) {
    const { primary, secondary, accent, info, dim, star, error } = useTheme();
    const theme = getTheme();
    const modelName = getModelDisplayName(config.model);
    const provDisplay = config.provider || detectProvider(config.model);
    const langInfo = ctx.language
        ? ctx.language + (ctx.framework ? " / " + ctx.framework : "")
        : "unknown";
    const cwdShort = ctx.cwd.length > 42 ? "..." + ctx.cwd.slice(-39) : ctx.cwd;
    const permLabel = skipPermissions ? "BYPASS" : getPermissionMode();
    const settingsTag = projectSettingsExist(ctx.cwd) ? "active" : "none";
    const allAgents = getAllAgents();
    const agentCount = Object.keys(allAgents).length;
    const todoStats = getTodoStats();
    const memCount = loadMemories().length;
    const themeId = getThemeId();
    // Claude Code style: clean box with essential info
    const line = "─".repeat(52);
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Box, { flexDirection: "column", marginLeft: 1, children: [_jsxs(Text, { color: dim, children: ["\u256D", line, "\u256E"] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "\u2502 " }), _jsx(Text, { color: primary, bold: true, children: "✦ Morningstar CLI" }), _jsxs(Text, { color: dim, children: [" ".repeat(52 - 17), "\u2502"] })] }), _jsxs(Text, { color: dim, children: ["\u2502", " ".repeat(52), "\u2502"] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "\u2502  Model    " }), _jsx(Text, { color: accent, children: modelName }), _jsxs(Text, { color: dim, children: [" [", provDisplay, "]"] }), _jsxs(Text, { color: dim, children: [" ".repeat(Math.max(0, 52 - 12 - modelName.length - provDisplay.length - 3)), "\u2502"] })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "\u2502  Project  " }), _jsx(Text, { bold: true, children: ctx.projectName }), _jsxs(Text, { color: dim, children: [" (", langInfo, ")"] }), _jsxs(Text, { color: dim, children: [" ".repeat(Math.max(0, 52 - 12 - ctx.projectName.length - langInfo.length - 3)), "\u2502"] })] }), ctx.hasGit && (_jsxs(Text, { children: [_jsx(Text, { color: dim, children: "\u2502  Branch   " }), _jsx(Text, { color: accent, children: ctx.gitBranch || "unknown" }), _jsxs(Text, { color: dim, children: [" ".repeat(Math.max(0, 52 - 12 - (ctx.gitBranch || "unknown").length)), "\u2502"] })] })), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "\u2502  CWD      " }), _jsx(Text, { children: cwdShort }), _jsxs(Text, { color: dim, children: [" ".repeat(Math.max(0, 52 - 12 - cwdShort.length)), "\u2502"] })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "\u2502  Perms    " }), skipPermissions ? (_jsx(Text, { color: error, bold: true, children: "BYPASS" })) : (_jsx(Text, { children: permLabel })), _jsxs(Text, { color: dim, children: [" ".repeat(Math.max(0, 52 - 12 - (skipPermissions ? 6 : permLabel.length))), "\u2502"] })] }), _jsxs(Text, { color: dim, children: ["\u2502", " ".repeat(52), "\u2502"] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "\u2502  Tools    " }), _jsx(Text, { color: info, children: "read write edit bash grep glob ls git web fetch gh" }), _jsx(Text, { color: dim, children: " \u2502" })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "\u2502  Agents   " }), _jsxs(Text, { color: secondary, children: [agentCount, " available"] }), _jsxs(Text, { color: dim, children: [" ".repeat(Math.max(0, 52 - 12 - String(agentCount).length - 10)), "\u2502"] })] }), _jsxs(Text, { color: dim, children: ["\u2570", line, "\u256F"] })] }), (todoStats.open > 0 || memCount > 0) && (_jsxs(Box, { flexDirection: "column", marginTop: 1, marginLeft: 2, children: [todoStats.open > 0 && (_jsxs(Text, { color: dim, children: ["  ", todoStats.open, " open task(s) ", _jsx(Text, { color: dim, children: "\u2014 /todo list" })] })), memCount > 0 && (_jsxs(Text, { color: dim, children: ["  ", memCount, " note(s) saved ", _jsx(Text, { color: dim, children: "\u2014 /memory list" })] }))] })), _jsxs(Box, { marginLeft: 2, marginTop: 1, children: [_jsx(Text, { color: dim, children: "  Type " }), _jsx(Text, { color: info, children: "/help" }), _jsx(Text, { color: dim, children: " for commands, " }), _jsx(Text, { color: info, children: "/features" }), _jsx(Text, { color: dim, children: " for capabilities" })] })] }));
}
//# sourceMappingURL=Banner.js.map