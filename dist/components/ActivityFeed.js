import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns, useTerminalRows } from "../hooks/useTerminalColumns.js";
import { fitText } from "../tui-layout.js";
export function ActivityFeed({ entries, active, label, turn = 0, maxTurns = 0 }) {
    const t = useTheme();
    const columns = useTerminalColumns();
    const rows = useTerminalRows();
    const [now, setNow] = useState(Date.now);
    const hasRunning = active && entries.some(e => e.status === "running" || e.status === "waiting");
    useEffect(() => {
        if (!hasRunning)
            return;
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
    }, [hasRunning]);
    if (!entries.length && !(active && label))
        return null;
    const visible = entries.slice(rows < 30 ? label && active ? -2 : -3 : -5);
    const completed = entries.filter(e => e.status === "completed").length;
    const icons = { running: "›", waiting: "?", completed: "✓", failed: "×", cancelled: "⊘" };
    return _jsxs(Box, { flexDirection: "column", marginLeft: 2, marginY: 1, children: [_jsxs(Text, { color: t.primary, bold: true, children: [active ? "Arbeitsverlauf" : "Letzte Arbeit", _jsxs(Text, { color: t.dim, children: ["  ", completed, "/", entries.length, " Tools fertig", active && turn ? ` · Turn ${turn}/${maxTurns || "∞"}` : "", " \u00B7 /activity"] })] }), active && label ? _jsx(Text, { color: t.accent, children: fitText(label, columns - 5) }) : null, visible.map(e => _jsxs(Text, { children: [_jsxs(Text, { color: e.status === "failed" ? t.error : e.status === "completed" ? t.success : t.accent, children: [icons[e.status], " "] }), _jsxs(Text, { color: t.dim, children: [fitText(e.agent, 14), "  "] }), _jsx(Text, { color: e.status === "running" ? t.primary : t.dim, children: fitText(e.label, Math.max(10, columns - 36)) }), _jsx(Text, { color: t.dim, children: e.duration !== undefined ? `  ${(e.duration / 1000).toFixed(1)}s` : e.status === "waiting" ? "  Freigabe" : `  ${Math.max(0, (now - e.startedAt) / 1000).toFixed(1)}s` })] }, e.id))] });
}
//# sourceMappingURL=ActivityFeed.js.map