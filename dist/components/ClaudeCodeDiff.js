import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
// ─── Simple LCS-based line diff ─────────────────────────
function computeDiff(oldLines, newLines) {
    const m = oldLines.length;
    const n = newLines.length;
    // Build LCS table
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
    // Backtrack to build diff
    const result = [];
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
    // Reverse since we built it backwards
    stack.reverse();
    return stack;
}
// ─── Group into hunks with context ──────────────────────
function buildHunks(diffLines, contextSize = 3) {
    if (diffLines.length === 0)
        return [];
    // Find ranges of changed lines (added/removed)
    const changeIndices = [];
    for (let i = 0; i < diffLines.length; i++) {
        if (diffLines[i].type !== "context")
            changeIndices.push(i);
    }
    if (changeIndices.length === 0)
        return [];
    // Build hunk ranges: expand each change by contextSize, merge overlapping
    const ranges = [];
    let start = Math.max(0, changeIndices[0] - contextSize);
    let end = Math.min(diffLines.length - 1, changeIndices[0] + contextSize);
    for (let k = 1; k < changeIndices.length; k++) {
        const newStart = Math.max(0, changeIndices[k] - contextSize);
        const newEnd = Math.min(diffLines.length - 1, changeIndices[k] + contextSize);
        if (newStart <= end + 1) {
            // Merge
            end = newEnd;
        }
        else {
            ranges.push([start, end]);
            start = newStart;
            end = newEnd;
        }
    }
    ranges.push([start, end]);
    return ranges.map(([s, e]) => ({
        lines: diffLines.slice(s, e + 1),
    }));
}
// ─── Recompute line numbers with offset ─────────────────
function applyOffset(hunks, startLine) {
    const offset = startLine - 1; // startLine is 1-based
    return hunks.map(hunk => ({
        lines: hunk.lines.map(line => ({
            ...line,
            oldLineNo: line.oldLineNo !== null ? line.oldLineNo + offset : null,
            newLineNo: line.newLineNo !== null ? line.newLineNo + offset : null,
        })),
    }));
}
// ─── Component ──────────────────────────────────────────
export function ClaudeCodeDiff({ oldStr, newStr, startLineNumber = 1, maxLines = 40 }) {
    const oldLines = oldStr.split("\n");
    const newLines = newStr.split("\n");
    const addedCount = newLines.length;
    const removedCount = oldLines.length;
    // Compute diff
    const diffLines = computeDiff(oldLines, newLines);
    let hunks = buildHunks(diffLines, 3);
    hunks = applyOffset(hunks, startLineNumber);
    // Compute max line number width for padding
    let maxLineNo = startLineNumber;
    for (const hunk of hunks) {
        for (const line of hunk.lines) {
            if (line.oldLineNo !== null && line.oldLineNo > maxLineNo)
                maxLineNo = line.oldLineNo;
            if (line.newLineNo !== null && line.newLineNo > maxLineNo)
                maxLineNo = line.newLineNo;
        }
    }
    const padWidth = Math.max(3, String(maxLineNo + Math.max(addedCount, removedCount)).length);
    // Count total display lines
    let totalDisplayLines = 0;
    for (const hunk of hunks)
        totalDisplayLines += hunk.lines.length;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { children: [_jsx(Text, { color: "#6b7280", children: "  ⎿  " }), _jsx(Text, { children: addedCount > 0 && removedCount > 0 ? (_jsxs(_Fragment, { children: [_jsxs(Text, { color: "#34d399", children: ["Added ", addedCount, " line", addedCount !== 1 ? "s" : ""] }), _jsx(Text, { color: "#6b7280", children: ", " }), _jsxs(Text, { color: "#f87171", children: ["removed ", removedCount, " line", removedCount !== 1 ? "s" : ""] })] })) : addedCount > 0 ? (_jsxs(Text, { color: "#34d399", children: ["Added ", addedCount, " line", addedCount !== 1 ? "s" : ""] })) : (_jsxs(Text, { color: "#f87171", children: ["Removed ", removedCount, " line", removedCount !== 1 ? "s" : ""] })) })] }), hunks.map((hunk, hunkIdx) => (_jsxs(Box, { flexDirection: "column", children: [hunkIdx > 0 && (_jsxs(Text, { color: "#6b7280", children: ["     ", "".padStart(padWidth), "  ", "..."] })), hunk.lines.slice(0, maxLines).map((line, lineIdx) => {
                        const lineNo = line.type === "removed"
                            ? line.oldLineNo
                            : line.newLineNo ?? line.oldLineNo;
                        const lineNoStr = lineNo !== null ? String(lineNo).padStart(padWidth) : " ".repeat(padWidth);
                        switch (line.type) {
                            case "context":
                                return (_jsxs(Text, { children: [_jsxs(Text, { color: "#6b7280", children: ["     ", lineNoStr, "  "] }), _jsx(Text, { children: line.content })] }, lineIdx));
                            case "removed":
                                return (_jsxs(Text, { children: [_jsxs(Text, { color: "#6b7280", children: ["     ", lineNoStr] }), _jsx(Text, { color: "#f87171", children: " -" }), _jsx(Text, { color: "#f87171", children: line.content })] }, lineIdx));
                            case "added":
                                return (_jsxs(Text, { children: [_jsxs(Text, { color: "#6b7280", children: ["     ", lineNoStr] }), _jsx(Text, { color: "#34d399", children: " +" }), _jsx(Text, { color: "#34d399", children: line.content })] }, lineIdx));
                        }
                    }), hunk.lines.length > maxLines && (_jsxs(Text, { color: "#6b7280", children: ["     ", "".padStart(padWidth), "  ", "... (+", hunk.lines.length - maxLines, " lines)"] }))] }, hunkIdx)))] }));
}
//# sourceMappingURL=ClaudeCodeDiff.js.map