import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import type { CLIConfig, ProjectContext } from "../types.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getAllAgents } from "../custom-agents.js";
import { fitText, getProviderLocation, getTerminalDensity } from "../tui-layout.js";

interface BannerProps {
  config: CLIConfig;
  ctx: ProjectContext;
  skipPermissions: boolean;
}

export function Banner({ config, ctx, skipPermissions }: BannerProps) {
  const { primary, accent, info, dim, success, warning, star } = useTheme();
  const columns = useTerminalColumns();
  const density = getTerminalDensity(columns);
  const provider = config.provider || detectProvider(config.model);
  const location = getProviderLocation(provider);
  const modelName = fitText(
    getModelDisplayName(config.model),
    density === "compact" ? 27 : density === "comfortable" ? 42 : 60,
  );
  const permissionMode = skipPermissions
    ? "bypassPermissions"
    : config.permissionMode || getPermissionMode();
  const settingsActive = projectSettingsExist(ctx.cwd);
  const agentCount = Object.keys(getAllAgents()).length;
  const project = fitText(ctx.projectName, density === "compact" ? 24 : 38);
  const language = ctx.language
    ? `${ctx.language}${ctx.framework ? ` / ${ctx.framework}` : ""}`
    : null;
  const locationColor = location === "local" ? success : location === "subscription" ? accent : info;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1} marginLeft={1}>
      <Box width={Math.max(20, columns - 2)} justifyContent="space-between">
        <Text>
          <Text color={star}>✦ </Text>
          <Text color={primary} bold>MORNINGSTAR</Text>
          {density !== "compact" ? <Text color={dim}>  sovereign coding agent</Text> : null}
        </Text>
        {density === "wide" ? <Text color={dim}>local · private workspace</Text> : null}
      </Box>

      <Text>
        <Text color={dim}>model  </Text>
        <Text color={primary}>{modelName}</Text>
        <Text color={dim}>  ·  </Text>
        <Text color={locationColor}>{location}</Text>
        {density !== "compact" ? (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={skipPermissions ? warning : accent}>{permissionMode}</Text>
          </>
        ) : null}
      </Text>

      <Text>
        <Text color={dim}>work   </Text>
        <Text color={accent}>{project}</Text>
        {ctx.gitBranch ? (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={success}>⎇ {fitText(ctx.gitBranch, 24)}</Text>
          </>
        ) : null}
        {density === "wide" && language ? (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={info}>{language}</Text>
          </>
        ) : null}
        {density === "wide" ? (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={settingsActive ? success : dim}>
              {settingsActive ? "project settings" : "global settings"}
            </Text>
            <Text color={dim}>  ·  </Text>
            <Text color={primary}>{agentCount} agents</Text>
          </>
        ) : null}
      </Text>

      <Text color={dim}>
        <Text color={accent}>/help</Text>
        {"  "}
        <Text color={accent}>/model</Text>
        {"  "}
        <Text color={accent}>/permissions</Text>
        {density !== "compact" ? (
          <>
            {"  "}
            <Text color={accent}>/agents</Text>
            {"  "}
            <Text color={accent}>/skills</Text>
          </>
        ) : null}
      </Text>
    </Box>
  );
}
