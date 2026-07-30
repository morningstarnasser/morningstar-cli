import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";

interface PlanBoxProps {
  reasoning: string;
  elapsed?: number;
  maxLines?: number;
}

export function PlanBox({ reasoning, elapsed, maxLines = 20 }: PlanBoxProps) {
  const { dim, accent } = useTheme();

  if (!reasoning) return null;

  const MAX_LINE_WIDTH = 68;
  // Word-wrap the reasoning text
  const rawLines = reasoning.split("\n");
  const wrappedLines: string[] = [];
  for (const line of rawLines) {
    if (line.length <= MAX_LINE_WIDTH) {
      wrappedLines.push(line);
    } else {
      let remaining = line;
      while (remaining.length > MAX_LINE_WIDTH) {
        // Find a good break point
        let breakIdx = remaining.lastIndexOf(" ", MAX_LINE_WIDTH);
        if (breakIdx <= 0) breakIdx = MAX_LINE_WIDTH;
        wrappedLines.push(remaining.slice(0, breakIdx));
        remaining = remaining.slice(breakIdx).trimStart();
      }
      if (remaining) wrappedLines.push(remaining);
    }
  }

  const visibleLines = wrappedLines.slice(0, maxLines);
  const hiddenCount = wrappedLines.length - visibleLines.length;
  const elapsedStr = elapsed ? `${(elapsed / 1000).toFixed(1)}s` : "";

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      <Text color={dim}>  ┌─ <Text color={accent} bold>Plan</Text> ──────────────────────────────────────</Text>
      {visibleLines.map((line, i) => (
        <Text key={i} color={dim}>  │ {line}</Text>
      ))}
      {hiddenCount > 0 && (
        <Text color={dim}>  │  ... (+{hiddenCount} Zeilen)</Text>
      )}
      <Text color={dim}>  └─── {elapsedStr} ───────────────────────────────────────</Text>
    </Box>
  );
}
