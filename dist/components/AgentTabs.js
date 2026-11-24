import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { Box, Text } from "ink";
import { useTerminalHit } from "../hooks/useTerminalPointer.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { useTheme } from "../hooks/useTheme.js";
import { displayText } from "../runtime/work-log.js";
function Tab({ label, selected, onSelect }) {
    const ref = useRef(null), t = useTheme();
    useTerminalHit(ref, e => { if (e.kind === "down")
        onSelect(); });
    return _jsx(Box, { ref: ref, marginRight: 1, children: _jsxs(Text, { color: selected ? "#151916" : t.accent, backgroundColor: selected ? t.accent : undefined, children: [" ", label, " "] }) });
}
export function AgentTabs({ branches, selected, onSelect }) {
    const [page, setPage] = useState(0), columns = useTerminalColumns();
    const count = Math.max(1, Math.floor((columns - 24) / 28)), pages = Math.ceil(branches.length / count), currentPage = Math.min(page, Math.max(0, pages - 1));
    if (!branches.length)
        return null;
    return _jsxs(Box, { flexWrap: "wrap", marginLeft: 1, children: [_jsx(Tab, { label: "Alle", selected: !selected, onSelect: () => onSelect(null) }), branches.slice(currentPage * count, (currentPage + 1) * count).map((b, i) => { const id = b.taskId ?? b.agentId; return _jsx(Tab, { label: `${currentPage * count + i + 1} ${b.status === "running" ? "●" : b.status === "completed" ? "✓" : b.status === "failed" ? "✘" : "○"} ${displayText(b.taskId && !b.taskId.match(/^[0-9a-f-]{20,}$/) ? b.taskId : b.agentId).slice(0, 22)}`, selected: selected === id, onSelect: () => onSelect(id) }, id); }), pages > 1 ? _jsxs(_Fragment, { children: [_jsx(Tab, { label: "\u2039", selected: false, onSelect: () => setPage(n => (n - 1 + pages) % pages) }), _jsxs(Text, { children: [currentPage + 1, "/", pages, " "] }), _jsx(Tab, { label: "\u203A", selected: false, onSelect: () => setPage(n => (n + 1) % pages) })] }) : null] });
}
//# sourceMappingURL=AgentTabs.js.map