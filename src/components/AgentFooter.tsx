import React from "react";
import { Box, Text } from "ink";
import { AgentTabs } from "./AgentTabs.js";
import type { AgentBranch } from "./AgentTree.js";
import { useTerminalColumns, useTerminalRows } from "../hooks/useTerminalColumns.js";
import { useTheme } from "../hooks/useTheme.js";
import { fitText } from "../tui-layout.js";
import { displayText } from "../runtime/work-log.js";

export function activeAgentBranches(branches: AgentBranch[]): AgentBranch[] {
  return branches.filter(b => b.status === "running" || b.status === "pending");
}

/** Only live workers occupy the pinned footer; completed reports stay in history. */
export function AgentFooter({ branches, selected, onSelect }: {
  branches: AgentBranch[]; selected: string | null; onSelect: (id: string | null) => void;
}) {
  const t = useTheme(), columns = useTerminalColumns(), rows = useTerminalRows();
  const active = activeAgentBranches(branches);
  if (!active.length) return null;
  const running = active.filter(b => b.status === "running"), pending = active.filter(b => b.status === "pending");
  const completed = branches.filter(b => b.status === "completed").length;
  const failed = branches.filter(b => b.status === "failed" || b.status === "cancelled").length;
  const limit = Math.max(1, Math.min(4, Math.floor(rows / 10)));
  const visible = [...running, ...pending].slice(0, limit);
  return <Box flexDirection="column" marginX={1}>
    <Text color={t.accent} bold wrap="truncate">Subagenten · {running.length} aktiv · {pending.length} warten · {completed}/{branches.length} fertig{failed ? ` · ${failed} ohne Erfolg` : ""}</Text>
    {visible.map(b => <Text key={b.taskId ?? b.agentId} wrap="truncate">
      <Text color={b.status === "running" ? t.info : t.dim}>{b.status === "running" ? "●" : "○"} {displayText(b.taskId ? `${b.taskId} · ${b.agentId}` : b.agentId)}</Text>
      <Text color={t.dim}> · {b.status === "running" ? "arbeitet" : "wartet"}{b.elapsedMs > 0 ? ` · ${Math.floor(b.elapsedMs / 1000)}s` : ""} · {fitText(displayText(b.detail).replace(/[\r\n\t]/g, " "), Math.max(12, columns - 44))}</Text>
    </Text>)}
    {active.length > visible.length ? <Text color={t.dim}>+ {active.length - visible.length} weitere · Details über die Agenten-Tabs</Text> : null}
    <AgentTabs branches={active} selected={selected} onSelect={onSelect} />
  </Box>;
}
