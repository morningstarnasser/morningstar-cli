import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
export function PlanBox({ reasoning, elapsed, maxLines = 20 }) {
    const { dim, accent } = useTheme();
    if (!reasoning)
        return null;
    const MAX_LINE_WIDTH = 68;
    // Word-wrap the reasoning text
    const rawLines = reasoning.split("\n");
    const wrappedLines = [];
    for (const line of rawLines) {
        if (line.length <= MAX_LINE_WIDTH) {
            wrappedLines.push(line);
        }
        else {
            let remaining = line;
            while (remaining.length > MAX_LINE_WIDTH) {
                // Find a good break point
                let breakIdx = remaining.lastIndexOf(" ", MAX_LINE_WIDTH);
                if (breakIdx <= 0)
                    breakIdx = MAX_LINE_WIDTH;
                wrappedLines.push(remaining.slice(0, breakIdx));
                remaining = remaining.slice(breakIdx).trimStart();
            }
            if (remaining)
                wrappedLines.push(remaining);
        }
    }
    const visibleLines = wrappedLines.slice(0, maxLines);
    const hiddenCount = wrappedLines.length - visibleLines.length;
    const elapsedStr = elapsed ? `${(elapsed / 1000).toFixed(1)}s` : "";
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, marginY: 1, children: [_jsxs(Text, { color: dim, children: ["  \u250C\u2500 ", _jsx(Text, { color: accent, bold: true, children: "Plan" }), " \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"] }), visibleLines.map((line, i) => (_jsxs(Text, { color: dim, children: ["  \u2502 ", line] }, i))), hiddenCount > 0 && (_jsxs(Text, { color: dim, children: ["  \u2502  ... (+", hiddenCount, " Zeilen)"] })), _jsxs(Text, { color: dim, children: ["  \u2514\u2500\u2500\u2500 ", elapsedStr, " \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"] })] }));
}
//# sourceMappingURL=PlanBox.js.map