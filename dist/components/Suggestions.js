import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
export function Suggestions({ items, selectedIndex, visible }) {
    if (!visible || items.length === 0)
        return null;
    const maxShow = Math.min(items.length, 8);
    const visibleItems = items.slice(0, maxShow);
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [visibleItems.map((item, i) => (_jsx(Box, { children: i === selectedIndex ? (_jsxs(Text, { backgroundColor: "#3b3b3b", children: [_jsxs(Text, { color: "#22d3ee", bold: true, children: ["  ", item.cmd] }), _jsxs(Text, { color: "#6b7280", children: [" ", item.desc] })] })) : (_jsxs(Text, { children: [_jsxs(Text, { color: "#6b7280", children: ["  ", item.cmd] }), _jsxs(Text, { color: "#4b5563", children: [" ", item.desc] })] })) }, item.cmd))), items.length > maxShow && (_jsxs(Text, { color: "#4b5563", children: ["  ... +", items.length - maxShow, " weitere"] }))] }));
}
//# sourceMappingURL=Suggestions.js.map