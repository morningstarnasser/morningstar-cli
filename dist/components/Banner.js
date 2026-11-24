import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useMemo } from "react";
import { STARTUP_FRAMES, STARTUP_FRAME_MS } from "../runtime/motion.js";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getAllAgents } from "../custom-agents.js";
import { fitText, getProviderLocation, getTerminalDensity } from "../tui-layout.js";
export function Banner({ config, ctx, skipPermissions, frame = STARTUP_FRAMES }) {
    const { primary, accent, info, dim, success, warning, star } = useTheme();
    const columns = useTerminalColumns();
    const density = getTerminalDensity(columns);
    const provider = config.provider || detectProvider(config.model);
    const location = getProviderLocation(provider);
    const modelName = fitText(getModelDisplayName(config.model), density === "compact" ? 27 : density === "comfortable" ? 42 : 60);
    const permissionMode = config.yolo ? "YOLO · auto" : skipPermissions
        ? "bypassPermissions"
        : config.permissionMode || getPermissionMode();
    const settingsActive = useMemo(() => projectSettingsExist(ctx.cwd), [ctx.cwd]);
    const agentCount = useMemo(() => Object.keys(getAllAgents()).length, []);
    const project = fitText(ctx.projectName, density === "compact" ? 24 : 38);
    const language = ctx.language
        ? `${ctx.language}${ctx.framework ? ` / ${ctx.framework}` : ""}`
        : null;
    const locationColor = location === "local" ? success : location === "subscription" ? accent : info;
    const width = Math.max(20, columns - 4);
    const art = ["       ╷       ", "    ╲  │  ╱    ", "  ─── ◇✦◇ ───  ", "    ╱  │  ╲    ", "       ╵       "];
    const glow = [dim, dim, "#966f49", "#c98b52", primary, "#ffe7bc", primary];
    const shimmer = frame < STARTUP_FRAMES ? glow[Math.min(glow.length - 1, Math.floor(frame / 2))] : primary;
    return (_jsxs(Box, { flexDirection: "column", marginY: 1, marginLeft: 2, width: width, children: [_jsxs(Box, { children: [density !== "compact" ? _jsx(Box, { flexDirection: "column", width: 19, flexShrink: 0, children: art.map((line, i) => _jsx(Text, { color: i === 2 ? shimmer : frame >= i + 2 ? primary : dim, children: line }, i)) }) : null, _jsxs(Box, { flexDirection: "column", flexGrow: 1, children: [_jsx(Text, { color: dim, children: density === "compact" ? "✦  YOUR TERMINAL. YOUR TEAM." : "YOUR TERMINAL. YOUR TEAM." }), _jsx(Text, { color: shimmer, bold: true, children: density === "compact" ? "M O R N I N G S T A R" : "M O R N I N G S T A R" }), _jsx(Text, { color: dim, children: " " }), _jsxs(Text, { children: [_jsx(Text, { color: accent, children: fitText(project, Math.max(12, width - 22)) }), ctx.gitBranch && density !== "compact" ? _jsxs(Text, { color: dim, children: ["  \u2387 ", fitText(ctx.gitBranch, 22)] }) : null] }), _jsx(Text, { color: dim, children: fitText(`${modelName} · ${location}`, Math.max(18, width - (density === "compact" ? 0 : 19))) })] })] }), _jsx(Text, { color: dim, children: "─".repeat(width) }), _jsxs(Text, { children: [_jsx(Text, { color: accent, children: "\u25C8 " }), _jsxs(Text, { color: primary, children: [agentCount, " agents"] }), _jsx(Text, { color: dim, children: "  /  " }), _jsx(Text, { color: skipPermissions ? warning : accent, children: fitText(permissionMode, 22) }), density === "wide" ? _jsxs(Text, { color: dim, children: ["  /  ", settingsActive ? "project settings" : "global settings", language ? `  /  ${language}` : ""] }) : null] }), _jsxs(Text, { color: dim, children: [_jsx(Text, { color: accent, children: "/swarm" }), " Team starten   ", _jsx(Text, { color: accent, children: "/skills" }), " Wissen   ", _jsx(Text, { color: accent, children: "/help" }), " Hilfe"] })] }));
}
/** Local state only: startup frames never rerender the app or delay input. */
export function StartupBanner({ onDone, ...props }) {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        let next = 0;
        const timer = setInterval(() => {
            next++;
            if (next >= STARTUP_FRAMES) {
                clearInterval(timer);
                onDone();
            }
            else
                setFrame(next);
        }, STARTUP_FRAME_MS);
        return () => clearInterval(timer);
    }, [onDone]);
    return _jsx(Banner, { ...props, frame: frame });
}
//# sourceMappingURL=Banner.js.map