import React from "react";
import { Box, Text } from "ink";
import { homedir } from "node:os";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { getSessionCosts, isFreeTier } from "../cost-tracker.js";
import { getCacheStats } from "../prompt-cache.js";
import { getModelDisplayName } from "../providers.js";
import { fitText, getProviderLocation, getTerminalDensity } from "../tui-layout.js";

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

function shortenCwd(cwd: string, maxLength: number): string {
  return fitText(cwd.replace(homedir(), "~"), maxLength);
}

function contextBar(used: number, max: number, width: number): {
  bar: string;
  pct: number;
} {
  if (max <= 0) return { bar: "░".repeat(width), pct: 0 };
  const pct = Math.min(1, used / max);
  const filledCount = Math.round(pct * width);
  return {
    bar: "█".repeat(filledCount) + "░".repeat(width - filledCount),
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
  const columns = useTerminalColumns();
  const density = getTerminalDensity(columns);
  const location = getProviderLocation(provider);
  const locationColor = location === "local" ? success : location === "subscription" ? accent : info;
  const shortCwd = shortenCwd(cwd, density === "compact" ? 16 : density === "comfortable" ? 22 : 42);
  const shortModel = fitText(
    getModelDisplayName(model),
    density === "compact" ? 17 : density === "comfortable" ? 22 : 38,
  );
  const costs = getSessionCosts();
  const cache = getCacheStats();
  const free = isFreeTier(model, provider);
  const costDisplay = free ? "free" : `$${costs.totalCost.toFixed(4)}`;
  const totalTokens = costs.totalInput + costs.totalOutput;
  const hasModes = activeAgent || activeSkill || vimMode || fastMode || debugMode || remainingBudget !== undefined;

  let ctxSection: React.ReactNode = null;
  if (density !== "compact" && contextTokens !== undefined && contextMax !== undefined && contextMax > 0) {
    const { bar, pct } = contextBar(contextTokens, contextMax, density === "wide" ? 14 : 8);
    const barColor = pct > 0.85 ? error : pct > 0.65 ? warning : success;
    ctxSection = (
      <>
        <Text color={dim}>  ·  ctx </Text>
        <Text color={barColor}>{bar}</Text>
        <Text color={pct > 0.85 ? error : info}> {Math.round(pct * 100)}%</Text>
      </>
    );
  }

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Text>
        <Text color={accent}>{shortCwd}</Text>
        <Text color={dim}>  ·  </Text>
        <Text color={primary}>{shortModel}</Text>
        <Text color={dim}> </Text>
        <Text color={locationColor}>[{location}]</Text>
        {density !== "compact" ? (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={free ? success : warning}>{costDisplay}</Text>
            <Text color={dim}> / </Text>
            <Text color={info}>{totalTokens.toLocaleString()} tok</Text>
          </>
        ) : null}
        {density === "wide" && tps !== undefined && tps > 0 ? (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={accent}>{tps.toFixed(0)} t/s</Text>
          </>
        ) : null}
        {density === "wide" && cache.totalRequests > 0 ? (
          <>
            <Text color={dim}>  ·  cache </Text>
            <Text color={cache.hitRate > 0.3 ? success : dim}>
              {(cache.hitRate * 100).toFixed(0)}%
            </Text>
          </>
        ) : null}
        {ctxSection}
      </Text>

      {hasModes && density !== "compact" ? (
        <Text>
          {activeAgent ? (
            <>
              <Text color={warning}>agent </Text>
              <Text color={primary}>{activeAgent}</Text>
              <Text color={dim}>  ·  </Text>
            </>
          ) : null}
          {activeSkill ? (
            <>
              <Text color={accent}>skill </Text>
              <Text color={primary}>{activeSkill}</Text>
              <Text color={dim}>  ·  </Text>
            </>
          ) : null}
          {vimMode ? <Text color={primary}>vim  </Text> : null}
          {fastMode ? <Text color={warning}>fast  </Text> : null}
          {debugMode ? <Text color={error}>debug  </Text> : null}
          {remainingBudget !== undefined ? (
            <>
              <Text color={info}>budget </Text>
              <Text color={remainingBudget < 0.5 ? error : remainingBudget < 2 ? warning : success}>
                ${remainingBudget.toFixed(2)}
              </Text>
            </>
          ) : null}
        </Text>
      ) : null}
    </Box>
  );
}
