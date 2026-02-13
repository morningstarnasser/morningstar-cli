import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import type { CLIConfig, ProjectContext } from "../types.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getAllAgents } from "../custom-agents.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getTheme } from "../theme.js";
import { getTodoStats } from "../todo.js";
import { loadMemories } from "../memory.js";

interface BannerProps {
  config: CLIConfig;
  ctx: ProjectContext;
  skipPermissions: boolean;
}

export function Banner({ config, ctx, skipPermissions }: BannerProps) {
  const { primary, secondary, accent, info, dim, error } = useTheme();

  const modelName = getModelDisplayName(config.model);
  const provDisplay = config.provider || detectProvider(config.model);
  const langInfo = ctx.language
    ? ctx.language + (ctx.framework ? " / " + ctx.framework : "")
    : "unknown";
  const cwdShort = ctx.cwd.length > 40 ? "..." + ctx.cwd.slice(-37) : ctx.cwd;
  const permLabel = skipPermissions ? "BYPASS" : getPermissionMode();
  const allAgents = getAllAgents();
  const agentCount = Object.keys(allAgents).length;
  const agentNames = Object.entries(allAgents).slice(0, 6).map(([id, a]) => ({ id, color: a.color }));
  const todoStats = getTodoStats();
  const memCount = loadMemories().length;

  const w = 58;
  const sep = "═".repeat(w);
  const thinSep = "─".repeat(w);

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ══ Premium Double-Border Frame ══ */}
      <Box flexDirection="column" marginLeft={1}>
        <Text color={primary}>╔{sep}╗</Text>
        <Text color={primary}>║<Text color={dim}>{" ".repeat(w)}</Text>║</Text>

        {/* Brand Header */}
        <Text color={primary}>║<Text>{"   "}<Text color={primary} bold>✦</Text>{"  "}<Text color={primary} bold>M O R N I N G S T A R</Text>{" ".repeat(w - 30)}</Text>║</Text>
        <Text color={primary}>║<Text>{"      "}<Text color={dim}>Terminal AI Coding Assistant</Text>{" ".repeat(w - 34)}</Text>║</Text>

        <Text color={primary}>║<Text color={dim}>{" ".repeat(w)}</Text>║</Text>
        <Text color={primary}>╠{thinSep}╣</Text>
        <Text color={primary}>║<Text color={dim}>{" ".repeat(w)}</Text>║</Text>

        {/* Info Section */}
        <Text color={primary}>║<Text>{"   "}<Text color={dim}>Model     </Text><Text color={accent} bold>{modelName}</Text><Text color={dim}>{" ".repeat(Math.max(1, w - 16 - modelName.length - provDisplay.length))}[{provDisplay}]</Text></Text>║</Text>
        <Text color={primary}>║<Text>{"   "}<Text color={dim}>Project   </Text><Text bold>{ctx.projectName}</Text><Text color={dim}>{" ".repeat(Math.max(1, w - 16 - ctx.projectName.length - langInfo.length))}({langInfo})</Text></Text>║</Text>
        {ctx.hasGit && (
          <Text color={primary}>║<Text>{"   "}<Text color={dim}>Branch    </Text><Text color={accent}>{ctx.gitBranch || "unknown"}</Text>{" ".repeat(Math.max(0, w - 13 - (ctx.gitBranch || "unknown").length))}</Text>║</Text>
        )}
        <Text color={primary}>║<Text>{"   "}<Text color={dim}>CWD       </Text><Text>{cwdShort}</Text>{" ".repeat(Math.max(0, w - 13 - cwdShort.length))}</Text>║</Text>
        <Text color={primary}>║<Text>{"   "}<Text color={dim}>Perms     </Text>{skipPermissions ? <Text color={error} bold>BYPASS</Text> : <Text>{permLabel}</Text>}{" ".repeat(Math.max(0, w - 13 - (skipPermissions ? 6 : permLabel.length)))}</Text>║</Text>

        <Text color={primary}>║<Text color={dim}>{" ".repeat(w)}</Text>║</Text>
        <Text color={primary}>╠{thinSep}╣</Text>
        <Text color={primary}>║<Text color={dim}>{" ".repeat(w)}</Text>║</Text>

        {/* Tools */}
        <Text color={primary}>║<Text>{"   "}<Text color={dim}>Tools     </Text><Text color={info}>read</Text><Text color={dim}> · </Text><Text color={info}>write</Text><Text color={dim}> · </Text><Text color={info}>edit</Text><Text color={dim}> · </Text><Text color={info}>bash</Text><Text color={dim}> · </Text><Text color={info}>grep</Text><Text color={dim}> · </Text><Text color={info}>glob</Text>{"  "}</Text>║</Text>
        <Text color={primary}>║<Text>{"             "}<Text color={info}>ls</Text><Text color={dim}> · </Text><Text color={info}>git</Text><Text color={dim}> · </Text><Text color={info}>web</Text><Text color={dim}> · </Text><Text color={info}>fetch</Text><Text color={dim}> · </Text><Text color={info}>gh</Text>{" ".repeat(w - 46)}</Text>║</Text>

        {/* Agents */}
        <Text color={primary}>║<Text>{"   "}<Text color={dim}>Agents    </Text>{agentNames.map((a, i) => <Text key={a.id}>{i > 0 ? <Text color={dim}> · </Text> : null}<Text color={a.color}>{a.id}</Text></Text>)}</Text>║</Text>

        <Text color={primary}>║<Text color={dim}>{" ".repeat(w)}</Text>║</Text>
        <Text color={primary}>╚{sep}╝</Text>
      </Box>

      {/* Status indicators */}
      {(todoStats.open > 0 || memCount > 0) && (
        <Box flexDirection="column" marginTop={1} marginLeft={3}>
          {todoStats.open > 0 && (
            <Text><Text color={accent}>●</Text><Text color={dim}> {todoStats.open} open task(s) — /todo list</Text></Text>
          )}
          {memCount > 0 && (
            <Text><Text color={info}>●</Text><Text color={dim}> {memCount} note(s) saved — /memory list</Text></Text>
          )}
        </Box>
      )}

      {/* Quick access line */}
      <Box marginLeft={3} marginTop={1}>
        <Text color={dim}>  </Text>
        <Text color={info}>/help</Text>
        <Text color={dim}> · </Text>
        <Text color={info}>/features</Text>
        <Text color={dim}> · </Text>
        <Text color={info}>/model</Text>
        <Text color={dim}> · </Text>
        <Text color={info}>/agents</Text>
        <Text color={dim}> · </Text>
        <Text color={info}>/skill:list</Text>
        <Text color={dim}> · </Text>
        <Text color={info}>/quit</Text>
      </Box>
    </Box>
  );
}
