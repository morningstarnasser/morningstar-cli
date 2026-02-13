import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// ─── History Search Component (Ctrl+R) ──────────────────
// Interactive reverse search through input history
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { searchInputHistory } from "../input-history.js";
export function HistorySearch({ onSelect, onCancel }) {
    const [query, setQuery] = useState("");
    const [selectedIdx, setSelectedIdx] = useState(0);
    const results = query ? searchInputHistory(query).slice(0, 8) : [];
    useInput((input, key) => {
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.return) {
            if (results.length > 0) {
                onSelect(results[selectedIdx] || "");
            }
            else {
                onCancel();
            }
            return;
        }
        if (key.upArrow) {
            setSelectedIdx(Math.max(0, selectedIdx - 1));
            return;
        }
        if (key.downArrow) {
            setSelectedIdx(Math.min(results.length - 1, selectedIdx + 1));
            return;
        }
        if (key.backspace || key.delete) {
            setQuery(prev => prev.slice(0, -1));
            setSelectedIdx(0);
            return;
        }
        if (input && !key.ctrl && !key.meta) {
            setQuery(prev => prev + input);
            setSelectedIdx(0);
        }
    });
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { children: [_jsx(Text, { color: "#f59e0b", bold: true, children: "(reverse-i-search)`" }), _jsx(Text, { color: "#22d3ee", children: query }), _jsx(Text, { color: "#f59e0b", bold: true, children: "': " }), results.length > 0 && _jsx(Text, { children: results[selectedIdx] })] }), results.length > 1 && (_jsx(Box, { flexDirection: "column", marginLeft: 2, children: results.map((r, i) => (_jsx(Box, { children: i === selectedIdx ? (_jsx(Text, { backgroundColor: "#3b3b3b", color: "#22d3ee", children: `  ${r}` })) : (_jsx(Text, { color: "#6b7280", children: `  ${r}` })) }, i))) }))] }));
}
//# sourceMappingURL=HistorySearch.js.map