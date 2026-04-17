import React, { useEffect, useState } from "react";
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

const STAR_FRAMES = ["✦", "✧", "⋆", "✧"] as const;
const TITLE = "MORNINGSTAR";

function useGlyphAnimation(intervalMs: number): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!process.stdout.isTTY) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % STAR_FRAMES.length), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return STAR_FRAMES[idx];
}

// Gradient chars for title — copper → amber → cream
function titleGradient(primary: string, accent: string, star: string): string[] {
  // Use theme's own primary/accent/star so gradient matches the picked theme.
  const palette = [primary, primary, accent, accent, star, star, star, accent, accent, primary, primary];
  return palette;
}

function Row({ children }: { children: React.ReactNode }) {
  return <Box marginLeft={1}>{children}</Box>;
}

export function Banner({ config, ctx, skipPermissions }: BannerProps) {
  const { primary, accent, info, dim, success, warning, star } = useTheme();
  const theme = getTheme();
  const provider = config.provider || detectProvider(config.model);
  const modelName = getModelDisplayName(config.model);
  const permissionMode = skipPermissions ? "bypass" : getPermissionMode();
  const settingsState = projectSettingsExist(ctx.cwd) ? "active" : "none";
  const todoStats = getTodoStats();
  const memoryCount = loadMemories().length;
  const agentCount = Object.keys(getAllAgents()).length;
  const languageLabel = ctx.language
    ? `${ctx.language}${ctx.framework ? ` / ${ctx.framework}` : ""}`
    : "unknown";
  const glyph = useGlyphAnimation(650);

  const gradient = titleGradient(primary, accent, star);
  const rule = "─".repeat(58);

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {/* Title row with animated glyph + gradient letters */}
      <Box>
        <Text color={star}>  {glyph}  </Text>
        {TITLE.split("").map((ch, i) => (
          <Text key={i} color={gradient[i % gradient.length]} bold>
            {ch}
            {i < TITLE.length - 1 ? " " : ""}
          </Text>
        ))}
        <Text color={dim}>   · independent coding cli</Text>
      </Box>

      <Row>
        <Text color={dim}>{rule}</Text>
      </Row>

      <Row>
        <Text color={dim}>project </Text>
        <Text color={primary}>{ctx.projectName}</Text>
        <Text color={dim}>  ·  stack </Text>
        <Text color={info}>{languageLabel}</Text>
        <Text color={dim}>  ·  branch </Text>
        <Text color={ctx.hasGit ? success : dim}>{ctx.gitBranch || "—"}</Text>
      </Row>

      <Row>
        <Text color={dim}>model   </Text>
        <Text color={primary}>{modelName}</Text>
        <Text color={dim}>  ·  provider </Text>
        <Text color={info}>{provider}</Text>
        <Text color={dim}>  ·  theme </Text>
        <Text color={warning}>{theme.name}</Text>
      </Row>

      <Row>
        <Text color={dim}>state   </Text>
        <Text color={settingsState === "active" ? success : dim}>{settingsState}</Text>
        <Text color={dim}>  ·  perms </Text>
        <Text color={skipPermissions ? warning : info}>{permissionMode}</Text>
        <Text color={dim}>  ·  agents </Text>
        <Text color={primary}>{agentCount}</Text>
        {(todoStats.open > 0 || memoryCount > 0) && (
          <>
            <Text color={dim}>  ·  </Text>
            {todoStats.open > 0 ? (
              <Text color={warning}>{todoStats.open} todos </Text>
            ) : null}
            {memoryCount > 0 ? (
              <Text color={info}>{memoryCount} memories</Text>
            ) : null}
          </>
        )}
      </Row>

      <Row>
        <Text color={dim}>{rule}</Text>
      </Row>

      <Row>
        <Text color={dim}>tip </Text>
        <Text color={accent}>/help</Text>
        <Text color={dim}>  </Text>
        <Text color={accent}>/model</Text>
        <Text color={dim}>  </Text>
        <Text color={accent}>/agents</Text>
        <Text color={dim}>  </Text>
        <Text color={accent}>/skills</Text>
        <Text color={dim}>  </Text>
        <Text color={accent}>/doctor</Text>
        <Text color={dim}>  ·  shift+tab</Text>
        <Text color={dim}> cycles permission modes</Text>
      </Row>
    </Box>
  );
}
