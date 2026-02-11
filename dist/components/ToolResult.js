import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
export function ToolResult({ tool, result, success, diff }) {
    const { success: successColor, error, warning, info, dim } = useTheme();
    const icon = success ? "✔" : "✘";
    const iconColor = success ? successColor : error;
    const preview = result.split("\n")[0]?.slice(0, 60) || "";
    const BOX_W = 70;
    const maxLines = 25;
    return (_jsxs(Box, { flexDirection: "column", marginY: 1, marginLeft: 2, children: [_jsxs(Text, { children: ["  ", _jsx(Text, { color: iconColor, children: icon }), " ", _jsxs(Text, { color: warning, bold: true, children: ["[", tool, "]"] }), preview && _jsxs(Text, { color: dim, children: [" ", preview.length >= 60 ? preview + "..." : preview] })] }), diff && tool === "edit" ? (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: dim, children: "  ┌" + "─".repeat(BOX_W) + "┐" }), _jsxs(Text, { color: dim, children: ["  │ ", _jsx(Text, { color: info, children: diff.filePath })] }), _jsx(Text, { color: dim, children: "  ├" + "─".repeat(BOX_W) + "┤" }), diff.oldStr.split("\n").slice(0, maxLines).map((line, i) => (_jsx(Text, { color: "red", children: "  │ - " + line }, `old-${i}`))), diff.newStr.split("\n").slice(0, maxLines).map((line, i) => (_jsx(Text, { color: "cyan", children: "  │ + " + line }, `new-${i}`))), _jsx(Text, { color: dim, children: "  └" + "─".repeat(BOX_W) + "┘" })] })) : (
            /* Normal output box */
            result.trim() && (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: dim, children: "  ┌" + "─".repeat(BOX_W) + "┐" }), result.split("\n").slice(0, maxLines).map((line, i) => {
                        const truncLine = line.length > BOX_W - 2 ? line.slice(0, BOX_W - 5) + "..." : line;
                        return (_jsxs(Text, { color: dim, children: ["  │ ", success ? _jsx(Text, { children: truncLine }) : _jsx(Text, { color: error, children: truncLine })] }, i));
                    }), result.split("\n").length > maxLines && (_jsxs(Text, { color: dim, children: ["  │ ", "... +", result.split("\n").length - maxLines, " weitere Zeilen"] })), _jsx(Text, { color: dim, children: "  └" + "─".repeat(BOX_W) + "┘" })] })))] }));
}
//# sourceMappingURL=ToolResult.js.map