import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
// ─── Simple LCS-based line diff ─────────────────────────
function computeDiff(oldLines, newLines) {
    const m = oldLines.length;
    const n = newLines.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    let i = m, j = n;
    const stack = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            stack.push({ type: "context", content: oldLines[i - 1], oldLineNo: i, newLineNo: j });
            i--;
            j--;
        }
        else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            stack.push({ type: "added", content: newLines[j - 1], oldLineNo: null, newLineNo: j });
            j--;
        }
        else {
            stack.push({ type: "removed", content: oldLines[i - 1], oldLineNo: i, newLineNo: null });
            i--;
        }
    }
    stack.reverse();
    return stack;
}
function buildHunks(diffLines, contextSize = 3) {
    if (diffLines.length === 0)
        return [];
    const changeIndices = [];
    for (let i = 0; i < diffLines.length; i++) {
        if (diffLines[i].type !== "context")
            changeIndices.push(i);
    }
    if (changeIndices.length === 0)
        return [];
    const ranges = [];
    let start = Math.max(0, changeIndices[0] - contextSize);
    let end = Math.min(diffLines.length - 1, changeIndices[0] + contextSize);
    for (let k = 1; k < changeIndices.length; k++) {
        const newStart = Math.max(0, changeIndices[k] - contextSize);
        const newEnd = Math.min(diffLines.length - 1, changeIndices[k] + contextSize);
        if (newStart <= end + 1) {
            end = newEnd;
        }
        else {
            ranges.push([start, end]);
            start = newStart;
            end = newEnd;
        }
    }
    ranges.push([start, end]);
    return ranges.map(([s, e]) => {
        const slice = diffLines.slice(s, e + 1);
        const oldNos = slice.map((l) => l.oldLineNo).filter((n) => n !== null);
        const newNos = slice.map((l) => l.newLineNo).filter((n) => n !== null);
        const oldStart = oldNos[0] ?? 0;
        const newStart = newNos[0] ?? 0;
        return {
            lines: slice,
            oldStart,
            newStart,
            oldCount: oldNos.length,
            newCount: newNos.length,
        };
    });
}
function applyOffset(hunks, startLine) {
    const offset = startLine - 1;
    return hunks.map((hunk) => ({
        ...hunk,
        oldStart: hunk.oldStart + offset,
        newStart: hunk.newStart + offset,
        lines: hunk.lines.map((line) => ({
            ...line,
            oldLineNo: line.oldLineNo !== null ? line.oldLineNo + offset : null,
            newLineNo: line.newLineNo !== null ? line.newLineNo + offset : null,
        })),
    }));
}
function shortFile(filePath) {
    if (!filePath)
        return null;
    const parts = filePath.split("/");
    if (parts.length <= 3)
        return filePath;
    return `…/${parts.slice(-3).join("/")}`;
}
export function ClaudeCodeDiff({ oldStr, newStr, filePath, startLineNumber = 1, maxLines = 40, }) {
    const { success, error, dim, primary, accent, info } = useTheme();
    const oldLines = oldStr.split("\n");
    const newLines = newStr.split("\n");
    const diffLines = computeDiff(oldLines, newLines);
    const addedCount = diffLines.filter((l) => l.type === "added").length;
    const removedCount = diffLines.filter((l) => l.type === "removed").length;
    let hunks = buildHunks(diffLines, 3);
    hunks = applyOffset(hunks, startLineNumber);
    let maxLineNo = startLineNumber;
    for (const hunk of hunks) {
        for (const line of hunk.lines) {
            if (line.oldLineNo !== null && line.oldLineNo > maxLineNo)
                maxLineNo = line.oldLineNo;
            if (line.newLineNo !== null && line.newLineNo > maxLineNo)
                maxLineNo = line.newLineNo;
        }
    }
    const padWidth = Math.max(3, String(maxLineNo).length);
    const fileLabel = shortFile(filePath);
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { color: dim, children: "\u23BF " }), fileLabel && (_jsxs(_Fragment, { children: [_jsx(Text, { color: primary, children: fileLabel }), _jsx(Text, { color: dim, children: "  " })] })), addedCount > 0 && (_jsxs(Text, { color: success, children: ["+", addedCount] })), addedCount > 0 && removedCount > 0 && _jsx(Text, { color: dim, children: " " }), removedCount > 0 && _jsxs(Text, { color: error, children: ["\u2212", removedCount] }), _jsx(Text, { color: dim, children: "  across " }), _jsx(Text, { color: info, children: hunks.length }), _jsxs(Text, { color: dim, children: [" hunk", hunks.length !== 1 ? "s" : ""] })] }), hunks.map((hunk, hunkIdx) => (_jsxs(Box, { flexDirection: "column", marginTop: hunkIdx === 0 ? 0 : 1, children: [_jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { color: dim, children: "  " }), _jsxs(Text, { color: accent, children: ["@@ \u2212", hunk.oldStart, ",", hunk.oldCount, " +", hunk.newStart, ",", hunk.newCount, " @@"] })] }), hunk.lines.slice(0, maxLines).map((line, lineIdx) => {
                        const lineNo = line.type === "removed"
                            ? line.oldLineNo
                            : line.newLineNo ?? line.oldLineNo;
                        const lineNoStr = lineNo !== null ? String(lineNo).padStart(padWidth) : " ".repeat(padWidth);
                        const marker = line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";
                        const color = line.type === "added" ? success : line.type === "removed" ? error : dim;
                        const gutterColor = line.type === "context" ? dim : color;
                        return (_jsxs(Box, { children: [_jsx(Text, { color: dim, children: "  " }), _jsxs(Text, { color: gutterColor, children: [lineNoStr, " "] }), _jsxs(Text, { color: color, children: [marker, " "] }), _jsx(Text, { color: line.type === "context" ? dim : color, children: line.content || " " })] }, lineIdx));
                    }), hunk.lines.length > maxLines && (_jsx(Box, { marginLeft: 2, children: _jsxs(Text, { color: dim, children: [" ".repeat(padWidth + 4), "\u2026 (+", hunk.lines.length - maxLines, " lines)"] }) }))] }, hunkIdx)))] }));
}
//# sourceMappingURL=ClaudeCodeDiff.js.map