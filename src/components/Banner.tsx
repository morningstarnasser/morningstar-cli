import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import type { CLIConfig, ProjectContext } from "../types.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getTheme } from "../theme.js";
import { getTodoStats } from "../todo.js";
import { loadMemories } from "../memory.js";
import { getAllAgents } from "../custom-agents.js";

interface BannerProps {
  config: CLIConfig;
  ctx: ProjectContext;
  skipPermissions: boolean;
}

export function Banner({ config, ctx, skipPermissions }: BannerProps) {
  const { primary, accent, info, dim, success, warning } = useTheme();
  const theme = getTheme();
  const provider = config.provider || detectProvider(config.model);
  const modelName = getModelDisplayName(config.model);
  const permissionMode = skipPermissions ? "bypass" : getPermissionMode();
  const settingsState = projectSettingsExist(ctx.cwd) ? "active" : "none";
  const todoStats = getTodoStats();
  const memoryCount = loadMemories().length;
  const agentCount = Object.keys(getAllAgents()).length;
  const languageLabel = ctx.language ? `${ctx.language}${ctx.framework ? ` / ${ctx.framework}` : ""}` : "unknown";

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Box>
        <Text color={accent}>╭─</Text>
        <Text color={primary} bold> Morningstar </Text>
        <Text color={dim}>independent coding cli</Text>
      </Box>
      <Box marginLeft={1} flexDirection="column">
        <Text>
          <Text color={dim}>project </Text>
          <Text color={primary}>{ctx.projectName}</Text>
          <Text color={dim}>  stack </Text>
          <Text color={info}>{languageLabel}</Text>
          <Text color={dim}>  branch </Text>
          <Text color={ctx.hasGit ? success : dim}>{ctx.gitBranch || "—"}</Text>
        </Text>
        <Text>
          <Text color={dim}>model </Text>
          <Text color={primary}>{modelName}</Text>
          <Text color={dim}>  provider </Text>
          <Text color={info}>{provider}</Text>
          <Text color={dim}>  theme </Text>
          <Text color={warning}>{theme.name}</Text>
        </Text>
        <Text>
          <Text color={dim}>state </Text>
          <Text color={settingsState === "active" ? success : dim}>{settingsState}</Text>
          <Text color={dim}>  perms </Text>
          <Text color={skipPermissions ? warning : info}>{permissionMode}</Text>
          <Text color={dim}>  agents </Text>
          <Text color={primary}>{agentCount}</Text>
        </Text>
        {(todoStats.open > 0 || memoryCount > 0) && (
          <Text>
            <Text color={dim}>context </Text>
            <Text color={warning}>{todoStats.open} todos</Text>
            <Text color={dim}>  •  </Text>
            <Text color={info}>{memoryCount} memories</Text>
          </Text>
        )}
      </Box>
      <Box>
        <Text color={accent}>╰─</Text>
        <Text color={dim}> /help  /model  /provider  /agents  /skill:list  /doctor </Text>
      </Box>
    </Box>
  );
}
