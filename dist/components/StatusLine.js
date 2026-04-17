import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { homedir } from "node:os";
import { useTheme } from "../hooks/useTheme.js";
import { getSessionCosts, isFreeTier } from "../cost-tracker.js";
import { getCacheStats } from "../prompt-cache.js";
function shortenCwd(cwd) {
    const home = homedir();
    const shortened = cwd.replace(home, "~");
    if (shortened.length <= 42)
        return shortened;
    const parts = shortened.split("/");
    if (parts.length < 4)
        return shortened;
    return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}
function shortenModel(model) {
    // strip provider prefix for display
    const stripped = model.replace(/^nvidia\//, "").replace(/^github\//, "");
    return stripped.length > 26 ? `${stripped.slice(0, 25)}…` : stripped;
}
function contextBar(used, max, width, filled, empty) {
    if (max <= 0)
        return { bar: empty.repeat(width), pct: 0 };
    const pct = Math.min(1, used / max);
    const filledCount = Math.round(pct * width);
    return {
        bar: filled.repeat(filledCount) + empty.repeat(width - filledCount),
        pct,
    };
}
export function StatusLine({ cwd, model, provider, activeAgent, activeSkill, vimMode, fastMode, debugMode, remainingBudget, contextTokens, contextMax, tps, }) {
    const { primary, accent, info, dim, warning, error, success } = useTheme();
    const shortCwd = shortenCwd(cwd);
    const shortModel = shortenModel(model);
    const isLocal = provider === "ollama";
    const modeLabel = isLocal ? "local" : "cloud";
    const costs = getSessionCosts();
    const cache = getCacheStats();
    const free = isFreeTier(model);
    const costDisplay = free
        ? "free"
        : `$${costs.totalCost.toFixed(4)}`;
    const totalTokens = costs.totalInput + costs.totalOutput;
    // Context bar
    let ctxSection = null;
    if (contextTokens !== undefined && contextMax !== undefined && contextMax > 0) {
        const { bar, pct } = contextBar(contextTokens, contextMax, 14, "█", "░");
        const pctLabel = `${Math.round(pct * 100)}%`;
        const barColor = pct > 0.85 ? error : pct > 0.65 ? warning : success;
        ctxSection = (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  ctx " }), _jsx(Text, { color: barColor, children: bar }), _jsx(Text, { color: dim, children: " " }), _jsx(Text, { color: pct > 0.85 ? error : info, children: pctLabel })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { marginLeft: 1, children: [_jsx(Text, { color: dim, children: "\u276F " }), _jsx(Text, { color: accent, children: shortCwd }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: primary, children: shortModel }), _jsx(Text, { color: dim, children: " " }), _jsxs(Text, { color: isLocal ? success : info, children: ["[", modeLabel, "]"] }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: free ? success : warning, children: costDisplay }), _jsx(Text, { color: dim, children: " / " }), _jsx(Text, { color: info, children: totalTokens.toLocaleString() }), _jsx(Text, { color: dim, children: " tok" }), tps !== undefined && tps > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: accent, children: tps.toFixed(0) }), _jsx(Text, { color: dim, children: " t/s" })] })), cache.totalRequests > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  cache " }), _jsxs(Text, { color: cache.hitRate > 0.3 ? success : dim, children: [(cache.hitRate * 100).toFixed(0), "%"] })] })), ctxSection] }), (activeAgent || activeSkill || vimMode || fastMode || debugMode || remainingBudget !== undefined) && (_jsxs(Box, { marginLeft: 1, children: [_jsx(Text, { color: dim, children: "  " }), activeAgent ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: warning, children: "agent:" }), _jsx(Text, { color: primary, children: activeAgent }), _jsx(Text, { color: dim, children: "  " })] })) : null, activeSkill ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: accent, children: "skill:" }), _jsx(Text, { color: primary, children: activeSkill }), _jsx(Text, { color: dim, children: "  " })] })) : null, vimMode ? _jsx(Text, { color: primary, children: "[vim] " }) : null, fastMode ? _jsx(Text, { color: warning, children: "[fast] " }) : null, debugMode ? _jsx(Text, { color: error, children: "[debug] " }) : null, remainingBudget !== undefined ? (_jsxs(_Fragment, { children: [_jsx(Text, { color: info, children: "budget " }), _jsxs(Text, { color: remainingBudget < 0.5 ? error : remainingBudget < 2 ? warning : success, children: ["$", remainingBudget.toFixed(2)] })] })) : null] }))] }));
}
//# sourceMappingURL=StatusLine.js.map