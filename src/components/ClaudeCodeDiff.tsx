import React from "react";
import { Box, Text } from "ink";

interface ClaudeCodeDiffProps {
  oldStr: string;
  newStr: string;
  startLineNumber?: number; // line number in file where change starts (1-based)
  maxLines?: number;
}

// ─── Diff Types ──────────────────────────────────────────
type DiffLineType = "context" | "added" | "removed";

interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

interface DiffHunk {
  lines: DiffLine[];
}

// ─── Simple LCS-based line diff ─────────────────────────
function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
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

  // Backtrack to build diff
  const result: DiffLine[] = [];
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

  // Reverse since we built it backwards
  stack.reverse();
  return stack;
}

// ─── Group into hunks with context ──────────────────────
function buildHunks(diffLines: DiffLine[], contextSize: number = 3): DiffHunk[] {
  if (diffLines.length === 0) return [];

  // Find ranges of changed lines (added/removed)
  const changeIndices: number[] = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== "context") changeIndices.push(i);
  }

  if (changeIndices.length === 0) return [];

  // Build hunk ranges: expand each change by contextSize, merge overlapping
  const ranges: Array<[number, number]> = [];
  let start = Math.max(0, changeIndices[0] - contextSize);
  let end = Math.min(diffLines.length - 1, changeIndices[0] + contextSize);

  for (let k = 1; k < changeIndices.length; k++) {
    const newStart = Math.max(0, changeIndices[k] - contextSize);
    const newEnd = Math.min(diffLines.length - 1, changeIndices[k] + contextSize);
    if (newStart <= end + 1) {
      // Merge
      end = newEnd;
    } else {
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
function applyOffset(hunks: DiffHunk[], startLine: number): DiffHunk[] {
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
export function ClaudeCodeDiff({ oldStr, newStr, startLineNumber = 1, maxLines = 40 }: ClaudeCodeDiffProps) {
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
      if (line.oldLineNo !== null && line.oldLineNo > maxLineNo) maxLineNo = line.oldLineNo;
      if (line.newLineNo !== null && line.newLineNo > maxLineNo) maxLineNo = line.newLineNo;
    }
  }
  const padWidth = Math.max(3, String(maxLineNo + Math.max(addedCount, removedCount)).length);

  // Count total display lines
  let totalDisplayLines = 0;
  for (const hunk of hunks) totalDisplayLines += hunk.lines.length;

  return (
    <Box flexDirection="column">
      {/* Summary */}
      <Text>
        <Text color="#6b7280">{"  ⎿  "}</Text>
        <Text>
          {addedCount > 0 && removedCount > 0 ? (
            <>
              <Text color="#34d399">Added {addedCount} line{addedCount !== 1 ? "s" : ""}</Text>
              <Text color="#6b7280">, </Text>
              <Text color="#f87171">removed {removedCount} line{removedCount !== 1 ? "s" : ""}</Text>
            </>
          ) : addedCount > 0 ? (
            <Text color="#34d399">Added {addedCount} line{addedCount !== 1 ? "s" : ""}</Text>
          ) : (
            <Text color="#f87171">Removed {removedCount} line{removedCount !== 1 ? "s" : ""}</Text>
          )}
        </Text>
      </Text>

      {/* Diff hunks */}
      {hunks.map((hunk, hunkIdx) => (
        <Box key={hunkIdx} flexDirection="column">
          {/* Separator between hunks */}
          {hunkIdx > 0 && (
            <Text color="#6b7280">
              {"     "}{"".padStart(padWidth)}{"  "}...
            </Text>
          )}

          {/* Diff lines */}
          {hunk.lines.slice(0, maxLines).map((line, lineIdx) => {
            const lineNo = line.type === "removed"
              ? line.oldLineNo
              : line.newLineNo ?? line.oldLineNo;
            const lineNoStr = lineNo !== null ? String(lineNo).padStart(padWidth) : " ".repeat(padWidth);

            switch (line.type) {
              case "context":
                return (
                  <Text key={lineIdx}>
                    <Text color="#6b7280">{"     "}{lineNoStr}{"  "}</Text>
                    <Text>{line.content}</Text>
                  </Text>
                );
              case "removed":
                return (
                  <Text key={lineIdx}>
                    <Text color="#6b7280">{"     "}{lineNoStr}</Text>
                    <Text color="#f87171">{" -"}</Text>
                    <Text color="#f87171">{line.content}</Text>
                  </Text>
                );
              case "added":
                return (
                  <Text key={lineIdx}>
                    <Text color="#6b7280">{"     "}{lineNoStr}</Text>
                    <Text color="#34d399">{" +"}</Text>
                    <Text color="#34d399">{line.content}</Text>
                  </Text>
                );
            }
          })}

          {/* Truncation notice */}
          {hunk.lines.length > maxLines && (
            <Text color="#6b7280">
              {"     "}{"".padStart(padWidth)}{"  "}... (+{hunk.lines.length - maxLines} lines)
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
