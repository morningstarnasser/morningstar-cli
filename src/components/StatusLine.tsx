import React from "react";
import { Box, Text } from "ink";
import { homedir } from "node:os";
import { useTheme } from "../hooks/useTheme.js";
import { getSessionCosts, isFreeTier } from "../cost-tracker.js";
import { getCacheStats } from "../prompt-cache.js";

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
  contextTokens?: number;
  contextMax?: number;
  tps?: number;
}

function shortenCwd(cwd: string): string {
  const home = homedir();
  const shortened = cwd.replace(home, "~");
  if (shortened.length <= 42) return shortened;
  const parts = shortened.split("/");
  if (parts.length < 4) return shortened;
  return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}

function shortenModel(model: string): string {
  // strip provider prefix for display
  const stripped = model.replace(/^nvidia\//, "").replace(/^github\//, "");
  return stripped.length > 26 ? `${stripped.slice(0, 25)}…` : stripped;
}

function contextBar(used: number, max: number, width: number, filled: string, empty: string): {
  bar: string;
  pct: number;
} {
  if (max <= 0) return { bar: empty.repeat(width), pct: 0 };
  const pct = Math.min(1, used / max);
  const filledCount = Math.round(pct * width);
  return {
    bar: filled.repeat(filledCount) + empty.repeat(width - filledCount),
    pct,
  };
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
  contextTokens,
  contextMax,
  tps,
}: StatusLineProps) {
  const { primary, accent, info, dim, warning, error, success } = useTheme();

  const shortCwd = shortenCwd(cwd);
  const shortModel = shortenModel(model);
  const isLocal = provider === "ollama";
  const modeLabel = isLocal ? "local" : "cloud";
  const costs = getSessionCosts();
  const cache = getCacheStats();
  const free = isFreeTier(model);
  const costDisplay = free
    ? "free"
    : `$${costs.totalCost.toFixed(4)}`;

  const totalTokens = costs.totalInput + costs.totalOutput;

  // Context bar
  let ctxSection: React.ReactNode = null;
  if (contextTokens !== undefined && contextMax !== undefined && contextMax > 0) {
    const { bar, pct } = contextBar(contextTokens, contextMax, 14, "█", "░");
    const pctLabel = `${Math.round(pct * 100)}%`;
    const barColor = pct > 0.85 ? error : pct > 0.65 ? warning : success;
    ctxSection = (
      <>
        <Text color={dim}>  ·  ctx </Text>
        <Text color={barColor}>{bar}</Text>
        <Text color={dim}> </Text>
        <Text color={pct > 0.85 ? error : info}>{pctLabel}</Text>
      </>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginLeft={1}>
        {/* Left cluster: path + model */}
        <Text color={dim}>❯ </Text>
        <Text color={accent}>{shortCwd}</Text>
        <Text color={dim}>  ·  </Text>
        <Text color={primary}>{shortModel}</Text>
        <Text color={dim}> </Text>
        <Text color={isLocal ? success : info}>[{modeLabel}]</Text>
        {/* Session numbers */}
        <Text color={dim}>  ·  </Text>
        <Text color={free ? success : warning}>{costDisplay}</Text>
        <Text color={dim}> / </Text>
        <Text color={info}>{totalTokens.toLocaleString()}</Text>
        <Text color={dim}> tok</Text>
        {tps !== undefined && tps > 0 && (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={accent}>{tps.toFixed(0)}</Text>
            <Text color={dim}> t/s</Text>
          </>
        )}
        {cache.totalRequests > 0 && (
          <>
            <Text color={dim}>  ·  cache </Text>
            <Text color={cache.hitRate > 0.3 ? success : dim}>
              {(cache.hitRate * 100).toFixed(0)}%
            </Text>
          </>
        )}
        {ctxSection}
      </Box>

      {(activeAgent || activeSkill || vimMode || fastMode || debugMode || remainingBudget !== undefined) && (
        <Box marginLeft={1}>
          <Text color={dim}>  </Text>
          {activeAgent ? (
            <>
              <Text color={warning}>agent:</Text>
              <Text color={primary}>{activeAgent}</Text>
              <Text color={dim}>  </Text>
            </>
          ) : null}
          {activeSkill ? (
            <>
              <Text color={accent}>skill:</Text>
              <Text color={primary}>{activeSkill}</Text>
              <Text color={dim}>  </Text>
            </>
          ) : null}
          {vimMode ? <Text color={primary}>[vim] </Text> : null}
          {fastMode ? <Text color={warning}>[fast] </Text> : null}
          {debugMode ? <Text color={error}>[debug] </Text> : null}
          {remainingBudget !== undefined ? (
            <>
              <Text color={info}>budget </Text>
              <Text color={remainingBudget < 0.5 ? error : remainingBudget < 2 ? warning : success}>
                ${remainingBudget.toFixed(2)}
              </Text>
            </>
          ) : null}
        </Box>
      )}
    </Box>
  );
}
