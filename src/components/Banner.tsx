import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import type { CLIConfig, ProjectContext } from "../types.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getAllAgents } from "../custom-agents.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getTheme, getThemeId } from "../theme.js";
import { getTodoStats } from "../todo.js";
import { loadMemories } from "../memory.js";

interface BannerProps {
  config: CLIConfig;
  ctx: ProjectContext;
  skipPermissions: boolean;
}

export function Banner({ config, ctx, skipPermissions }: BannerProps) {
  const { primary, secondary, accent, info, dim, star, error } = useTheme();
  const theme = getTheme();

  const modelName = getModelDisplayName(config.model);
  const provDisplay = config.provider || detectProvider(config.model);
  const langInfo = ctx.language
    ? ctx.language + (ctx.framework ? " / " + ctx.framework : "")
    : "unknown";
  const cwdShort = ctx.cwd.length > 42 ? "..." + ctx.cwd.slice(-39) : ctx.cwd;
  const permLabel = skipPermissions ? "BYPASS" : getPermissionMode();
  const settingsTag = projectSettingsExist(ctx.cwd) ? "active" : "none";
  const allAgents = getAllAgents();
  const agentCount = Object.keys(allAgents).length;
  const todoStats = getTodoStats();
  const memCount = loadMemories().length;
  const themeId = getThemeId();

  // Claude Code style: clean box with essential info
  const line = "─".repeat(52);

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Clean header box */}
      <Box flexDirection="column" marginLeft={1}>
        <Text color={dim}>╭{line}╮</Text>

        <Text>
          <Text color={dim}>│ </Text>
          <Text color={primary} bold>{"✦ Morningstar CLI"}</Text>
          <Text color={dim}>{" ".repeat(52 - 17)}│</Text>
        </Text>

        <Text color={dim}>│{" ".repeat(52)}│</Text>

        <Text>
          <Text color={dim}>│  Model    </Text>
          <Text color={accent}>{modelName}</Text>
          <Text color={dim}> [{provDisplay}]</Text>
          <Text color={dim}>{" ".repeat(Math.max(0, 52 - 12 - modelName.length - provDisplay.length - 3))}│</Text>
        </Text>

        <Text>
          <Text color={dim}>│  Project  </Text>
          <Text bold>{ctx.projectName}</Text>
          <Text color={dim}> ({langInfo})</Text>
          <Text color={dim}>{" ".repeat(Math.max(0, 52 - 12 - ctx.projectName.length - langInfo.length - 3))}│</Text>
        </Text>

        {ctx.hasGit && (
          <Text>
            <Text color={dim}>│  Branch   </Text>
            <Text color={accent}>{ctx.gitBranch || "unknown"}</Text>
            <Text color={dim}>{" ".repeat(Math.max(0, 52 - 12 - (ctx.gitBranch || "unknown").length))}│</Text>
          </Text>
        )}

        <Text>
          <Text color={dim}>│  CWD      </Text>
          <Text>{cwdShort}</Text>
          <Text color={dim}>{" ".repeat(Math.max(0, 52 - 12 - cwdShort.length))}│</Text>
        </Text>

        <Text>
          <Text color={dim}>│  Perms    </Text>
          {skipPermissions ? (
            <Text color={error} bold>BYPASS</Text>
          ) : (
            <Text>{permLabel}</Text>
          )}
          <Text color={dim}>{" ".repeat(Math.max(0, 52 - 12 - (skipPermissions ? 6 : permLabel.length)))}│</Text>
        </Text>

        <Text color={dim}>│{" ".repeat(52)}│</Text>

        {/* Tools line */}
        <Text>
          <Text color={dim}>│  Tools    </Text>
          <Text color={info}>read write edit bash grep glob ls git web fetch gh</Text>
          <Text color={dim}> │</Text>
        </Text>

        {/* Agents line */}
        <Text>
          <Text color={dim}>│  Agents   </Text>
          <Text color={secondary}>{agentCount} available</Text>
          <Text color={dim}>{" ".repeat(Math.max(0, 52 - 12 - String(agentCount).length - 10))}│</Text>
        </Text>

        <Text color={dim}>╰{line}╯</Text>
      </Box>

      {/* Status indicators */}
      {(todoStats.open > 0 || memCount > 0) && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          {todoStats.open > 0 && (
            <Text color={dim}>  {todoStats.open} open task(s) <Text color={dim}>— /todo list</Text></Text>
          )}
          {memCount > 0 && (
            <Text color={dim}>  {memCount} note(s) saved <Text color={dim}>— /memory list</Text></Text>
          )}
        </Box>
      )}

      {/* Tip line */}
      <Box marginLeft={2} marginTop={1}>
        <Text color={dim}>  Type </Text>
        <Text color={info}>/help</Text>
        <Text color={dim}> for commands, </Text>
        <Text color={info}>/features</Text>
        <Text color={dim}> for capabilities</Text>
      </Box>
    </Box>
  );
}
