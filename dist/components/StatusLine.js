import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { homedir } from "node:os";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { getSessionCosts, isFreeTier } from "../cost-tracker.js";
import { getCacheStats } from "../prompt-cache.js";
import { getModelDisplayName } from "../providers.js";
import { fitText, getProviderLocation, getTerminalDensity } from "../tui-layout.js";
function shortenCwd(cwd, maxLength) {
    return fitText(cwd.replace(homedir(), "~"), maxLength);
}
function contextBar(used, max, width) {
    if (max <= 0)
        return { bar: "░".repeat(width), pct: 0 };
    const pct = Math.min(1, used / max);
    const filledCount = Math.round(pct * width);
    return {
        bar: "█".repeat(filledCount) + "░".repeat(width - filledCount),
        pct,
    };
}
export function StatusLine({ cwd, model, provider, activeAgent, activeSkill, vimMode, fastMode, debugMode, remainingBudget, contextTokens, contextMax, tps, }) {
    const { primary, accent, info, dim, warning, error, success } = useTheme();
    const columns = useTerminalColumns();
    const density = getTerminalDensity(columns);
    const location = getProviderLocation(provider);
    const locationColor = location === "local" ? success : location === "subscription" ? accent : info;
    const shortCwd = shortenCwd(cwd, density === "compact" ? 16 : density === "comfortable" ? 22 : 42);
    const shortModel = fitText(getModelDisplayName(model), density === "compact" ? 17 : density === "comfortable" ? 22 : 38);
    const costs = getSessionCosts();
    const cache = getCacheStats();
    const free = isFreeTier(model, provider);
    const costDisplay = free ? "free" : `$${costs.totalCost.toFixed(4)}`;
    const totalTokens = costs.totalInput + costs.totalOutput;
    const hasModes = activeAgent || activeSkill || vimMode || fastMode || debugMode || remainingBudget !== undefined;
    let ctxSection = null;
    if (density !== "compact" && contextTokens !== undefined && contextMax !== undefined && contextMax > 0) {
        const { bar, pct } = contextBar(contextTokens, contextMax, density === "wide" ? 14 : 8);
        const barColor = pct > 0.85 ? error : pct > 0.65 ? warning : success;
        ctxSection = (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  ctx " }), _jsx(Text, { color: barColor, children: bar }), _jsxs(Text, { color: pct > 0.85 ? error : info, children: [" ", Math.round(pct * 100), "%"] })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: accent, children: shortCwd }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: primary, children: shortModel }), _jsx(Text, { color: dim, children: " " }), _jsxs(Text, { color: locationColor, children: ["[", location, "]"] }), density !== "compact" ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: free ? success : warning, children: costDisplay }), _jsx(Text, { color: dim, children: " / " }), _jsxs(Text, { color: info, children: [totalTokens.toLocaleString(), " tok"] })] })) : null, density === "wide" && tps !== undefined && tps > 0 ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsxs(Text, { color: accent, children: [tps.toFixed(0), " t/s"] })] })) : null, density === "wide" && cache.totalRequests > 0 ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  cache " }), _jsxs(Text, { color: cache.hitRate > 0.3 ? success : dim, children: [(cache.hitRate * 100).toFixed(0), "%"] })] })) : null, ctxSection] }), hasModes && density !== "compact" ? (_jsxs(Text, { children: [activeAgent ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: warning, children: "agent " }), _jsx(Text, { color: primary, children: activeAgent }), _jsx(Text, { color: dim, children: "  \u00B7  " })] })) : null, activeSkill ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: accent, children: "skill " }), _jsx(Text, { color: primary, children: activeSkill }), _jsx(Text, { color: dim, children: "  \u00B7  " })] })) : null, vimMode ? _jsx(Text, { color: primary, children: "vim  " }) : null, fastMode ? _jsx(Text, { color: warning, children: "fast  " }) : null, debugMode ? _jsx(Text, { color: error, children: "debug  " }) : null, remainingBudget !== undefined ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: info, children: "budget " }), _jsxs(Text, { color: remainingBudget < 0.5 ? error : remainingBudget < 2 ? warning : success, children: ["$", remainingBudget.toFixed(2)] })] })) : null] })) : null] }));
}
//# sourceMappingURL=StatusLine.js.map