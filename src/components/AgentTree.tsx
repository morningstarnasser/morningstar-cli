import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns, useTerminalRows } from "../hooks/useTerminalColumns.js";
import { fitText } from "../tui-layout.js";
import { motionEnabled } from "../runtime/motion.js";

export type AgentStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface AgentBranch {
  taskId?: string;
  agentId: string;
  status: AgentStatus;
  detail: string;
  elapsedMs: number;
}

interface AgentTreeProps {
  title: string;
  branches: AgentBranch[];
  startTime: number;
  done?: boolean;
  elapsedMs?: number;
}

const STATUS_ICON: Record<AgentStatus, string> = {
  pending: "◻",
  running: "◼",
  completed: "✓",
  failed: "✘",
  cancelled: "⊘",
};

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem}s`;
}

export function AgentTree({ title, branches, startTime, done, elapsedMs }: AgentTreeProps) {
  const { primary, dim, success, error, info, warning, accent } = useTheme();
  const [frame, setFrame] = useState(0);
  const columns = useTerminalColumns();
  const rows = useTerminalRows();
  const width = Math.max(16, columns - 8);
  const limit = Math.min(8, Math.max(2, Math.floor((rows - 17) / 2)));
  // Running tasks remain visible even when the plan has many queued dependents.
  const visible = [...branches.filter(b => b.status === "running"), ...branches.filter(b => b.status !== "running")].slice(0, limit);

  useEffect(() => {
    if (done || !motionEnabled()) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 150);
    return () => clearInterval(id);
  }, [done]);

  const running = branches.filter((b) => b.status === "running").length;
  const completed = branches.filter((b) => b.status === "completed").length;
  const failed = branches.filter((b) => b.status === "failed").length;
  const totalElapsed = done ? elapsedMs ?? Math.max(0, ...branches.map(b => b.elapsedMs)) : Date.now() - startTime;

  function statusColor(s: AgentStatus): string {
    switch (s) {
      case "completed":
        return success;
      case "failed":
        return error;
      case "running":
        return info;
      case "cancelled":
        return warning;
      default:
        return dim;
    }
  }

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      <Text color={primary} bold><Text color={accent}>{done ? "✦ " : `${SPINNER[frame]} `}</Text>{fitText(title, width)}</Text>
      <Text color={dim}>{branches.length} tasks · <Text color={info}>{running} aktiv</Text> · <Text color={success}>{completed} fertig</Text>{failed ? <Text color={error}> · {failed} fehlgeschlagen</Text> : null} · {formatElapsed(totalElapsed)}</Text>
      <Text color={dim}>{"━".repeat(Math.round(Math.min(width, 36) * completed / Math.max(1, branches.length)))}{"─".repeat(Math.min(width, 36) - Math.round(Math.min(width, 36) * completed / Math.max(1, branches.length)))}</Text>

      {visible.map((b, i) => {
        const isLast = i === visible.length - 1;
        const connector = isLast ? "└─" : "├─";
        const color = statusColor(b.status);
        return (
          <Box key={`${b.taskId || b.agentId}-${i}`} flexDirection="column">
            <Text>
            <Text color={dim}>  {connector} </Text>
            <Text color={color}>{STATUS_ICON[b.status]} </Text>
            <Text color={primary} bold>
              {fitText(b.taskId ? `${b.taskId} · ${b.agentId}` : b.agentId, Math.max(10, width - 18))}
            </Text>
            <Text color={dim}>  </Text>
            {b.elapsedMs > 0 && (
              <>
                <Text color={dim}>  ·  </Text>
                <Text color={dim}>{formatElapsed(b.elapsedMs)}</Text>
              </>
            )}
            </Text>
            <Text color={b.status === "failed" ? error : dim}>     {fitText(b.detail.replace(/[\r\n\t]/g, " "), width - 5)}</Text>
          </Box>
        );
      })}
      {branches.length > visible.length ? <Text color={dim}>  + {branches.length - visible.length} weitere Tasks</Text> : null}
    </Box>
  );
}
