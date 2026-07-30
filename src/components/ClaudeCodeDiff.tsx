import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";

interface ClaudeCodeDiffProps {
  oldStr: string;
  newStr: string;
  filePath?: string;
  startLineNumber?: number; // 1-based line number in the source file
  maxLines?: number;
}

type DiffLineType = "context" | "added" | "removed";

interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

interface DiffHunk {
  lines: DiffLine[];
  oldStart: number;
  newStart: number;
  oldCount: number;
  newCount: number;
}

// ─── Simple LCS-based line diff ─────────────────────────
function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m, j = n;
  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "context", content: oldLines[i - 1], oldLineNo: i, newLineNo: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "added", content: newLines[j - 1], oldLineNo: null, newLineNo: j });
      j--;
    } else {
      stack.push({ type: "removed", content: oldLines[i - 1], oldLineNo: i, newLineNo: null });
      i--;
    }
  }

  stack.reverse();
  return stack;
}

function buildHunks(diffLines: DiffLine[], contextSize: number = 3): DiffHunk[] {
  if (diffLines.length === 0) return [];

  const changeIndices: number[] = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== "context") changeIndices.push(i);
  }
  if (changeIndices.length === 0) return [];

  const ranges: Array<[number, number]> = [];
  let start = Math.max(0, changeIndices[0] - contextSize);
  let end = Math.min(diffLines.length - 1, changeIndices[0] + contextSize);
  for (let k = 1; k < changeIndices.length; k++) {
    const newStart = Math.max(0, changeIndices[k] - contextSize);
    const newEnd = Math.min(diffLines.length - 1, changeIndices[k] + contextSize);
    if (newStart <= end + 1) {
      end = newEnd;
    } else {
      ranges.push([start, end]);
      start = newStart;
      end = newEnd;
    }
  }
  ranges.push([start, end]);

  return ranges.map(([s, e]) => {
    const slice = diffLines.slice(s, e + 1);
    const oldNos = slice.map((l) => l.oldLineNo).filter((n): n is number => n !== null);
    const newNos = slice.map((l) => l.newLineNo).filter((n): n is number => n !== null);
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

function applyOffset(hunks: DiffHunk[], startLine: number): DiffHunk[] {
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

function shortFile(filePath: string | undefined): string | null {
  if (!filePath) return null;
  const parts = filePath.split("/");
  if (parts.length <= 3) return filePath;
  return `…/${parts.slice(-3).join("/")}`;
}

export function ClaudeCodeDiff({
  oldStr,
  newStr,
  filePath,
  startLineNumber = 1,
  maxLines = 40,
}: ClaudeCodeDiffProps) {
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
      if (line.oldLineNo !== null && line.oldLineNo > maxLineNo) maxLineNo = line.oldLineNo;
      if (line.newLineNo !== null && line.newLineNo > maxLineNo) maxLineNo = line.newLineNo;
    }
  }
  const padWidth = Math.max(3, String(maxLineNo).length);
  const fileLabel = shortFile(filePath);

  return (
    <Box flexDirection="column">
      {/* Header: file + stats */}
      <Box marginLeft={2}>
        <Text color={dim}>⎿ </Text>
        {fileLabel && (
          <>
            <Text color={primary}>{fileLabel}</Text>
            <Text color={dim}>  </Text>
          </>
        )}
        {addedCount > 0 && (
          <Text color={success}>
            +{addedCount}
          </Text>
        )}
        {addedCount > 0 && removedCount > 0 && <Text color={dim}> </Text>}
        {removedCount > 0 && <Text color={error}>−{removedCount}</Text>}
        <Text color={dim}>  across </Text>
        <Text color={info}>{hunks.length}</Text>
        <Text color={dim}> hunk{hunks.length !== 1 ? "s" : ""}</Text>
      </Box>

      {hunks.map((hunk, hunkIdx) => (
        <Box key={hunkIdx} flexDirection="column" marginTop={hunkIdx === 0 ? 0 : 1}>
          {/* Hunk header like @@ -oldStart,oldCount +newStart,newCount @@ */}
          <Box marginLeft={2}>
            <Text color={dim}>  </Text>
            <Text color={accent}>
              @@ −{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
            </Text>
          </Box>

          {hunk.lines.slice(0, maxLines).map((line, lineIdx) => {
            const lineNo =
              line.type === "removed"
                ? line.oldLineNo
                : line.newLineNo ?? line.oldLineNo;
            const lineNoStr =
              lineNo !== null ? String(lineNo).padStart(padWidth) : " ".repeat(padWidth);

            const marker =
              line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";
            const color =
              line.type === "added" ? success : line.type === "removed" ? error : dim;
            const gutterColor = line.type === "context" ? dim : color;

            return (
              <Box key={lineIdx}>
                <Text color={dim}>  </Text>
                <Text color={gutterColor}>{lineNoStr} </Text>
                <Text color={color}>{marker} </Text>
                <Text color={line.type === "context" ? dim : color}>
                  {line.content || " "}
                </Text>
              </Box>
            );
          })}

          {hunk.lines.length > maxLines && (
            <Box marginLeft={2}>
              <Text color={dim}>
                {" ".repeat(padWidth + 4)}… (+{hunk.lines.length - maxLines} lines)
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
