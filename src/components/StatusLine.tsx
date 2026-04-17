import React from "react";
import { Box, Text } from "ink";
import { homedir } from "node:os";
import { useTheme } from "../hooks/useTheme.js";

interface StatusLineProps {
  cwd: string;
  model: string;
  provider: string;
  activeAgent: string | null;
  activeSkill: string | null;
  vimMode: boolean;
  fastMode: boolean;
  debugMode: boolean;
  remainingBudget?: number;
}

export function StatusLine({
  cwd,
  model,
  provider,
  activeAgent,
  activeSkill,
  vimMode,
  fastMode,
  debugMode,
  remainingBudget,
}: StatusLineProps) {
  const { primary, accent, info, dim, warning, error, success } = useTheme();
  const shortCwd = cwd.replace(homedir(), "~");
  const shortModel = model.length > 28 ? `${model.slice(0, 28)}…` : model;
  const modeLabel = provider === "ollama" ? "local" : "cloud";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={dim}>╭──────────────────────────────────────────────────────────────────────────────╮</Text>
      </Box>
      <Box marginLeft={1}>
        <Text color={dim}>cwd </Text>
        <Text color={accent}>{shortCwd}</Text>
        <Text color={dim}>  model </Text>
        <Text color={primary}>{shortModel}</Text>
        <Text color={dim}>  provider </Text>
        <Text color={modeLabel === "local" ? success : info}>{provider}</Text>
      </Box>
      <Box marginLeft={1}>
        <Text color={modeLabel === "local" ? success : info}>[{modeLabel}]</Text>
        {activeAgent ? <Text color={warning}> [agent:{activeAgent}]</Text> : null}
        {activeSkill ? <Text color={accent}> [skill:{activeSkill}]</Text> : null}
        {vimMode ? <Text color={primary}> [vim]</Text> : null}
        {fastMode ? <Text color={warning}> [fast]</Text> : null}
        {debugMode ? <Text color={error}> [debug]</Text> : null}
        {remainingBudget !== undefined ? <Text color={info}> [budget:${remainingBudget.toFixed(2)}]</Text> : null}
      </Box>
      <Box>
        <Text color={dim}>╰──────────────────────────────────────────────────────────────────────────────╯</Text>
      </Box>
    </Box>
  );
}
