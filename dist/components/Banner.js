import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getAllAgents } from "../custom-agents.js";
import { fitText, getProviderLocation, getTerminalDensity } from "../tui-layout.js";
export function Banner({ config, ctx, skipPermissions }) {
    const { primary, accent, info, dim, success, warning, star } = useTheme();
    const columns = useTerminalColumns();
    const density = getTerminalDensity(columns);
    const provider = config.provider || detectProvider(config.model);
    const location = getProviderLocation(provider);
    const modelName = fitText(getModelDisplayName(config.model), density === "compact" ? 27 : density === "comfortable" ? 42 : 60);
    const permissionMode = skipPermissions
        ? "bypassPermissions"
        : config.permissionMode || getPermissionMode();
    const settingsActive = projectSettingsExist(ctx.cwd);
    const agentCount = Object.keys(getAllAgents()).length;
    const project = fitText(ctx.projectName, density === "compact" ? 24 : 38);
    const language = ctx.language
        ? `${ctx.language}${ctx.framework ? ` / ${ctx.framework}` : ""}`
        : null;
    const locationColor = location === "local" ? success : location === "subscription" ? accent : info;
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, marginBottom: 1, marginLeft: 1, children: [_jsxs(Box, { width: Math.max(20, columns - 2), justifyContent: "space-between", children: [_jsxs(Text, { children: [_jsx(Text, { color: star, children: "\u2726 " }), _jsx(Text, { color: primary, bold: true, children: "MORNINGSTAR" }), density !== "compact" ? _jsx(Text, { color: dim, children: "  sovereign coding agent" }) : null] }), density === "wide" ? _jsx(Text, { color: dim, children: "local \u00B7 private workspace" }) : null] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "model  " }), _jsx(Text, { color: primary, children: modelName }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: locationColor, children: location }), density !== "compact" ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: skipPermissions ? warning : accent, children: permissionMode })] })) : null] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "work   " }), _jsx(Text, { color: accent, children: project }), ctx.gitBranch ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsxs(Text, { color: success, children: ["\u2387 ", fitText(ctx.gitBranch, 24)] })] })) : null, density === "wide" && language ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: info, children: language })] })) : null, density === "wide" ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: settingsActive ? success : dim, children: settingsActive ? "project settings" : "global settings" }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsxs(Text, { color: primary, children: [agentCount, " agents"] })] })) : null] }), _jsxs(Text, { color: dim, children: [_jsx(Text, { color: accent, children: "/help" }), "  ", _jsx(Text, { color: accent, children: "/model" }), "  ", _jsx(Text, { color: accent, children: "/permissions" }), density !== "compact" ? (_jsxs(_Fragment, { children: ["  ", _jsx(Text, { color: accent, children: "/agents" }), "  ", _jsx(Text, { color: accent, children: "/skills" })] })) : null] })] }));
}
//# sourceMappingURL=Banner.js.map