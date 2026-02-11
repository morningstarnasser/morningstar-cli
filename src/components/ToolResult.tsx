import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";

interface ToolResultProps {
  tool: string;
  result: string;
  success: boolean;
  diff?: { filePath: string; oldStr: string; newStr: string };
}

export function ToolResult({ tool, result, success, diff }: ToolResultProps) {
  const { success: successColor, error, warning, info, dim } = useTheme();

  const icon = success ? "✔" : "✘";
  const iconColor = success ? successColor : error;
  const preview = result.split("\n")[0]?.slice(0, 60) || "";
  const BOX_W = 70;
  const maxLines = 25;

  return (
    <Box flexDirection="column" marginY={1} marginLeft={2}>
      {/* Header */}
      <Text>
        {"  "}<Text color={iconColor}>{icon}</Text>{" "}
        <Text color={warning} bold>[{tool}]</Text>
        {preview && <Text color={dim}> {preview.length >= 60 ? preview + "..." : preview}</Text>}
      </Text>

      {/* Diff view for edit tool */}
      {diff && tool === "edit" ? (
        <Box flexDirection="column">
          <Text color={dim}>{"  ┌" + "─".repeat(BOX_W) + "┐"}</Text>
          <Text color={dim}>{"  │ "}<Text color={info}>{diff.filePath}</Text></Text>
          <Text color={dim}>{"  ├" + "─".repeat(BOX_W) + "┤"}</Text>
          {diff.oldStr.split("\n").slice(0, maxLines).map((line, i) => (
            <Text key={`old-${i}`} color="red">{"  │ - " + line}</Text>
          ))}
          {diff.newStr.split("\n").slice(0, maxLines).map((line, i) => (
            <Text key={`new-${i}`} color="cyan">{"  │ + " + line}</Text>
          ))}
          <Text color={dim}>{"  └" + "─".repeat(BOX_W) + "┘"}</Text>
        </Box>
      ) : (
        /* Normal output box */
        result.trim() && (
          <Box flexDirection="column">
            <Text color={dim}>{"  ┌" + "─".repeat(BOX_W) + "┐"}</Text>
            {result.split("\n").slice(0, maxLines).map((line, i) => {
              const truncLine = line.length > BOX_W - 2 ? line.slice(0, BOX_W - 5) + "..." : line;
              return (
                <Text key={i} color={dim}>
                  {"  │ "}{success ? <Text>{truncLine}</Text> : <Text color={error}>{truncLine}</Text>}
                </Text>
              );
            })}
            {result.split("\n").length > maxLines && (
              <Text color={dim}>{"  │ "}... +{result.split("\n").length - maxLines} weitere Zeilen</Text>
            )}
            <Text color={dim}>{"  └" + "─".repeat(BOX_W) + "┘"}</Text>
          </Box>
        )
      )}
    </Box>
  );
}
