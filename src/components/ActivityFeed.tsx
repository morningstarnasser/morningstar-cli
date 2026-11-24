import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { ActivityEntry } from "../runtime/activity.js";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns, useTerminalRows } from "../hooks/useTerminalColumns.js";
import { fitText } from "../tui-layout.js";

export function ActivityFeed({ entries, active, label, turn = 0, maxTurns = 0 }: { entries: ActivityEntry[]; active: boolean; label?: string; turn?: number; maxTurns?: number }) {
  const t = useTheme();
  const columns = useTerminalColumns();
  const rows = useTerminalRows();
  const [now, setNow] = useState(Date.now);
  const hasRunning = active && entries.some(e => e.status === "running" || e.status === "waiting");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [hasRunning]);
  if (!entries.length && !(active && label)) return null;
  const visible = entries.slice(rows < 30 ? label && active ? -2 : -3 : -5);
  const completed = entries.filter(e => e.status === "completed").length;
  const icons = { running: "›", waiting: "?", completed: "✓", failed: "×", cancelled: "⊘" };
  return <Box flexDirection="column" marginLeft={2} marginY={1}>
    <Text color={t.primary} bold>{active ? "Arbeitsverlauf" : "Letzte Arbeit"}<Text color={t.dim}>  {completed}/{entries.length} Tools fertig{active && turn ? ` · Turn ${turn}/${maxTurns || "∞"}` : ""} · /activity</Text></Text>
    {active && label ? <Text color={t.accent}>{fitText(label, columns - 5)}</Text> : null}
    {visible.map(e => <Text key={e.id}>
      <Text color={e.status === "failed" ? t.error : e.status === "completed" ? t.success : t.accent}>{icons[e.status]} </Text>
      <Text color={t.dim}>{fitText(e.agent, 14)}  </Text>
      <Text color={e.status === "running" ? t.primary : t.dim}>{fitText(e.label, Math.max(10, columns - 36))}</Text>
      <Text color={t.dim}>{e.duration !== undefined ? `  ${(e.duration / 1000).toFixed(1)}s` : e.status === "waiting" ? "  Freigabe" : `  ${Math.max(0, (now - e.startedAt) / 1000).toFixed(1)}s`}</Text>
    </Text>)}
  </Box>;
}
