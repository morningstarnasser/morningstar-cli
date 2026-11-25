import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { AgentTabs } from "./AgentTabs.js";
import { useTerminalColumns, useTerminalRows } from "../hooks/useTerminalColumns.js";
import { useTheme } from "../hooks/useTheme.js";
import { fitText } from "../tui-layout.js";
import { displayText } from "../runtime/work-log.js";
export function activeAgentBranches(branches) {
    return branches.filter(b => b.status === "running" || b.status === "pending");
}
/** Only live workers occupy the pinned footer; completed reports stay in history. */
export function AgentFooter({ branches, selected, onSelect }) {
    const t = useTheme(), columns = useTerminalColumns(), rows = useTerminalRows();
    const active = activeAgentBranches(branches);
    if (!active.length)
        return null;
    const running = active.filter(b => b.status === "running"), pending = active.filter(b => b.status === "pending");
    const completed = branches.filter(b => b.status === "completed").length;
    const failed = branches.filter(b => b.status === "failed" || b.status === "cancelled").length;
    const limit = Math.max(1, Math.min(4, Math.floor(rows / 10)));
    const visible = [...running, ...pending].slice(0, limit);
    return _jsxs(Box, { flexDirection: "column", marginX: 1, children: [_jsxs(Text, { color: t.accent, bold: true, wrap: "truncate", children: ["Subagenten \u00B7 ", running.length, " aktiv \u00B7 ", pending.length, " warten \u00B7 ", completed, "/", branches.length, " fertig", failed ? ` · ${failed} ohne Erfolg` : ""] }), visible.map(b => _jsxs(Text, { wrap: "truncate", children: [_jsxs(Text, { color: b.status === "running" ? t.info : t.dim, children: [b.status === "running" ? "●" : "○", " ", displayText(b.taskId ? `${b.taskId} · ${b.agentId}` : b.agentId)] }), _jsxs(Text, { color: t.dim, children: [" \u00B7 ", b.status === "running" ? "arbeitet" : "wartet", b.elapsedMs > 0 ? ` · ${Math.floor(b.elapsedMs / 1000)}s` : "", " \u00B7 ", fitText(displayText(b.detail).replace(/[\r\n\t]/g, " "), Math.max(12, columns - 44))] })] }, b.taskId ?? b.agentId)), active.length > visible.length ? _jsxs(Text, { color: t.dim, children: ["+ ", active.length - visible.length, " weitere \u00B7 Details \u00FCber die Agenten-Tabs"] }) : null, _jsx(AgentTabs, { branches: active, selected: selected, onSelect: onSelect })] });
}
//# sourceMappingURL=AgentFooter.js.map