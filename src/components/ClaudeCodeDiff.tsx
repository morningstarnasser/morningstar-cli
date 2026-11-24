import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { displayText, fileChange } from "../runtime/work-log.js";

interface ClaudeCodeDiffProps {
  oldStr: string;
  newStr: string;
  filePath?: string;
  startLineNumber?: number;
  maxLines?: number;
}

/** Shared bounded diff for legacy tool panels and inline edits. */
export function ClaudeCodeDiff({ oldStr, newStr, filePath, startLineNumber = 1, maxLines = 40 }: ClaudeCodeDiffProps) {
  const t = useTheme();
  const change = useMemo(() => fileChange(oldStr, newStr, startLineNumber, maxLines), [oldStr, newStr, startLineNumber, maxLines]);
  return <Box flexDirection="column" marginLeft={2}>
    <Text><Text color={t.dim}>└ </Text>{filePath ? `${displayText(filePath)} ` : ""}(<Text color="#7bd88f">+{change.added}</Text> <Text color="#ff7d7d">-{change.removed}</Text>)</Text>
    {change.lines.map((line, index) => <Text key={index} wrap="wrap" color={line.kind === "added" ? "#7bd88f" : line.kind === "removed" ? "#ff7d7d" : t.dim}>
      {`${String(line.line).padStart(4)} ${line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "} ${displayText(line.text).slice(0, 600)}`}
    </Text>)}
    {change.omitted ? <Text color={t.dim}>… {change.omitted} weitere Diff-Zeilen</Text> : null}
    {change.coarse ? <Text color={t.dim}>Grosse Änderung: ersetzten Bereich vollständig gezählt.</Text> : null}
  </Box>;
}
