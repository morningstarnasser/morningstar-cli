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

// ─── Gradient Wave Block Letters ────────────────────────
// Jede Zeile des Block-Texts wird buchstabenweise eingefaerbt.
// Gradient: gold → amber → orange → rose → pink → fuchsia → purple

const GRADIENT_COLORS = [
  "#f59e0b", // gold
  "#d97706", // amber
  "#f97316", // orange
  "#f43f5e", // rose
  "#ec4899", // pink
  "#d946ef", // fuchsia
  "#a855f7", // purple
];

// Block-Buchstaben fuer "MORNING" (7 Buchstaben → 7 Farben)
const MORNING_LINES = [
  ["███╗   ███╗", " ██████╗ ", "██████╗ ", "███╗   ██╗", "██╗", "███╗   ██╗", " ██████╗ "],
  ["████╗ ████║", "██╔═══██╗", "██╔══██╗", "████╗  ██║", "██║", "████╗  ██║", "██╔════╝ "],
  ["██╔████╔██║", "██║   ██║", "██████╔╝", "██╔██╗ ██║", "██║", "██╔██╗ ██║", "██║  ███╗"],
  ["██║╚██╔╝██║", "██║   ██║", "██╔══██╗", "██║╚██╗██║", "██║", "██║╚██╗██║", "██║   ██║"],
  ["██║ ╚═╝ ██║", "╚██████╔╝", "██║  ██║", "██║ ╚████║", "██║", "██║ ╚████║", "╚██████╔╝"],
  ["╚═╝     ╚═╝", " ╚═════╝ ", "╚═╝  ╚═╝", "╚═╝  ╚═══╝", "╚═╝", "╚═╝  ╚═══╝", " ╚═════╝ "],
];

// Block-Buchstaben fuer "STAR" (4 Buchstaben)
const STAR_LINES = [
  ["███████╗", "████████╗", " █████╗ ", "██████╗ "],
  ["██╔════╝", "╚══██╔══╝", "██╔══██╗", "██╔══██╗"],
  ["███████╗", "   ██║   ", "███████║", "██████╔╝"],
  ["╚════██║", "   ██║   ", "██╔══██║", "██╔══██╗"],
  ["███████║", "   ██║   ", "██║  ██║", "██║  ██║"],
  ["╚══════╝", "   ╚═╝   ", "╚═╝  ╚═╝", "╚═╝  ╚═╝"],
];

// Gradient-Farben fuer STAR (4 Buchstaben, ab gold)
const STAR_COLORS = ["#f59e0b", "#d97706", "#f97316", "#f43f5e"];

export function Banner({ config, ctx, skipPermissions }: BannerProps) {
  const { primary, secondary, accent, info, dim, star } = useTheme();
  const theme = getTheme();

  const modelName = getModelDisplayName(config.model);
  const provDisplay = config.provider || detectProvider(config.model);
  const langInfo = ctx.language
    ? ctx.language + (ctx.framework ? " / " + ctx.framework : "")
    : "unbekannt";
  const cwdShort = ctx.cwd.length > 42 ? "..." + ctx.cwd.slice(-39) : ctx.cwd;
  const permLabel = skipPermissions ? "BYPASS" : getPermissionMode();
  const settingsTag = projectSettingsExist(ctx.cwd) ? "active" : "none";
  const allAgents = getAllAgents();
  const agentNames = Object.entries(allAgents).map(([id, a]) => ({ id, color: a.color }));
  const todoStats = getTodoStats();
  const memCount = loadMemories().length;

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* ─── Gradient Wave Block Letters ─── */}
      <Box flexDirection="column" marginLeft={3}>
        {/* MORNING */}
        {MORNING_LINES.map((segments, lineIdx) => (
          <Text key={`m-${lineIdx}`} bold>
            {"  "}
            {segments.map((seg, i) => (
              <Text key={i} color={GRADIENT_COLORS[i]}>{seg}</Text>
            ))}
          </Text>
        ))}

        {/* STAR + Tagline */}
        {STAR_LINES.map((segments, lineIdx) => (
          <Text key={`s-${lineIdx}`} bold>
            {"  "}
            {segments.map((seg, i) => (
              <Text key={i} color={STAR_COLORS[i]}>{seg}</Text>
            ))}
            {lineIdx === 1 && (
              <Text>   <Text color="#ec4899">Terminal AI Coding Assistant</Text></Text>
            )}
            {lineIdx === 2 && (
              <Text>   <Text color={dim}>Powered by</Text> <Text color={accent} bold>Mr.Morningstar</Text></Text>
            )}
            {lineIdx === 3 && (
              <Text>   <Text color={info}>github.com/morningstarnasser</Text></Text>
            )}
          </Text>
        ))}
      </Box>

      {/* ─── Gold Separator ─── */}
      <Box marginLeft={2} marginTop={1}>
        <Text color={primary}>  {"━".repeat(68)}</Text>
      </Box>

      {/* ─── Info Box ─── */}
      <Box flexDirection="column" marginTop={1} marginLeft={2} borderStyle="single" borderColor={dim} paddingX={1}>
        <Text>
          <Text color={primary}> &#9733; </Text><Text color={dim}>Model    </Text>
          <Text color={info}>{modelName}</Text> <Text color={dim}>[</Text><Text color={accent}>{provDisplay}</Text><Text color={dim}>]</Text>
        </Text>
        <Text>
          <Text color={primary}> &#9733; </Text><Text color={dim}>Projekt  </Text>
          <Text bold>{ctx.projectName}</Text> <Text color={dim}>(</Text><Text>{langInfo}</Text><Text color={dim}>)</Text>
        </Text>
        <Text>
          <Text color={primary}> &#9733; </Text><Text color={dim}>Branch   </Text><Text color={accent}>{ctx.hasGit ? (ctx.gitBranch || "unknown") : "—"}</Text>
          {"   "}
          <Text color={primary}>&#9733; </Text><Text color={dim}>Perms  </Text>
          {skipPermissions ? <Text color="#ef4444" bold>BYPASS</Text> : <Text color={dim}>{permLabel}</Text>}
          {"   "}
          <Text color={primary}>&#9733; </Text><Text color={dim}>Theme  </Text><Text color={primary}>{theme.name}</Text>
        </Text>
        <Text>
          <Text color={primary}> &#9733; </Text><Text color={dim}>CWD      </Text><Text>{cwdShort}</Text>
          {"   "}
          <Text color={primary}>&#9733; </Text><Text color={dim}>Settings </Text>
          {settingsTag === "active" ? <Text color="#10b981">active</Text> : <Text color={dim}>none</Text>}
        </Text>
      </Box>

      {/* ─── Tools & Agents ─── */}
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <Text>
          <Text color={dim}>  Tools   </Text>
          <Text color={info}>read</Text><Text color={dim}> · </Text>
          <Text color={info}>write</Text><Text color={dim}> · </Text>
          <Text color={info}>edit</Text><Text color={dim}> · </Text>
          <Text color={info}>bash</Text><Text color={dim}> · </Text>
          <Text color={info}>grep</Text><Text color={dim}> · </Text>
          <Text color={info}>glob</Text><Text color={dim}> · </Text>
          <Text color={info}>ls</Text><Text color={dim}> · </Text>
          <Text color={info}>git</Text><Text color={dim}> · </Text>
          <Text color={info}>web</Text><Text color={dim}> · </Text>
          <Text color={info}>fetch</Text><Text color={dim}> · </Text>
          <Text color={info}>gh</Text>
        </Text>
        <Text>
          <Text color={dim}>  Agents  </Text>
          {agentNames.map((a, i) => (
            <Text key={a.id}>
              {i > 0 && <Text color={dim}> · </Text>}
              <Text color={a.color}>{a.id}</Text>
            </Text>
          ))}
        </Text>
        <Text>
          <Text color={dim}>  Hilfe   </Text>
          <Text color="#f0abfc">/help</Text><Text color={dim}> · </Text>
          <Text color="#f0abfc">/features</Text><Text color={dim}> · </Text>
          <Text color="#f0abfc">/agents</Text><Text color={dim}> · </Text>
          <Text color="#f0abfc">/agent:create</Text><Text color={dim}> · </Text>
          <Text color="#f0abfc">/quit</Text>
        </Text>
      </Box>

      {/* ─── Status Indicators ─── */}
      {(todoStats.open > 0 || memCount > 0) && (
        <Box flexDirection="column" marginTop={1} marginLeft={4}>
          {todoStats.open > 0 && (
            <Text color={accent}>  {todoStats.open} offene Aufgabe(n) <Text color={dim}>— /todo list</Text></Text>
          )}
          {memCount > 0 && (
            <Text color={info}>  {memCount} Notiz(en) gespeichert <Text color={dim}>— /memory list</Text></Text>
          )}
        </Box>
      )}

      <Box marginLeft={2} marginTop={1}>
        <Text color={dim}>  {"─".repeat(68)}</Text>
      </Box>
    </Box>
  );
}
