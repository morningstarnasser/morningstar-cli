import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getTheme } from "../theme.js";
import { getTodoStats } from "../todo.js";
import { loadMemories } from "../memory.js";
import { getAllAgents } from "../custom-agents.js";
export function Banner({ config, ctx, skipPermissions }) {
    const { primary, accent, info, dim, success, warning } = useTheme();
    const theme = getTheme();
    const provider = config.provider || detectProvider(config.model);
    const modelName = getModelDisplayName(config.model);
    const permissionMode = skipPermissions ? "bypass" : getPermissionMode();
    const settingsState = projectSettingsExist(ctx.cwd) ? "active" : "none";
    const todoStats = getTodoStats();
    const memoryCount = loadMemories().length;
    const agentCount = Object.keys(getAllAgents()).length;
    const languageLabel = ctx.language ? `${ctx.language}${ctx.framework ? ` / ${ctx.framework}` : ""}` : "unknown";
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, marginBottom: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: accent, children: "\u256D\u2500" }), _jsx(Text, { color: primary, bold: true, children: " Morningstar " }), _jsx(Text, { color: dim, children: "independent coding cli" })] }), _jsxs(Box, { marginLeft: 1, flexDirection: "column", children: [_jsxs(Text, { children: [_jsx(Text, { color: dim, children: "project " }), _jsx(Text, { color: primary, children: ctx.projectName }), _jsx(Text, { color: dim, children: "  stack " }), _jsx(Text, { color: info, children: languageLabel }), _jsx(Text, { color: dim, children: "  branch " }), _jsx(Text, { color: ctx.hasGit ? success : dim, children: ctx.gitBranch || "—" })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "model " }), _jsx(Text, { color: primary, children: modelName }), _jsx(Text, { color: dim, children: "  provider " }), _jsx(Text, { color: info, children: provider }), _jsx(Text, { color: dim, children: "  theme " }), _jsx(Text, { color: warning, children: theme.name })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "state " }), _jsx(Text, { color: settingsState === "active" ? success : dim, children: settingsState }), _jsx(Text, { color: dim, children: "  perms " }), _jsx(Text, { color: skipPermissions ? warning : info, children: permissionMode }), _jsx(Text, { color: dim, children: "  agents " }), _jsx(Text, { color: primary, children: agentCount })] }), (todoStats.open > 0 || memoryCount > 0) && (_jsxs(Text, { children: [_jsx(Text, { color: dim, children: "context " }), _jsxs(Text, { color: warning, children: [todoStats.open, " todos"] }), _jsx(Text, { color: dim, children: "  \u2022  " }), _jsxs(Text, { color: info, children: [memoryCount, " memories"] })] }))] }), _jsxs(Box, { children: [_jsx(Text, { color: accent, children: "\u2570\u2500" }), _jsx(Text, { color: dim, children: " /help  /model  /provider  /agents  /skill:list  /doctor " })] })] }));
}
//# sourceMappingURL=Banner.js.map