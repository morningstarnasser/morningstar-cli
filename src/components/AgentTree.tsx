import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";

export type AgentStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface AgentBranch {
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

export function AgentTree({ title, branches, startTime, done }: AgentTreeProps) {
  const { primary, dim, success, error, info, warning, accent } = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120);
    return () => clearInterval(id);
  }, [done]);

  const running = branches.filter((b) => b.status === "running").length;
  const completed = branches.filter((b) => b.status === "completed").length;
  const failed = branches.filter((b) => b.status === "failed").length;
  const totalElapsed = Date.now() - startTime;

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
      <Box>
        <Text color={accent} bold>
          {done ? "✦ " : `${SPINNER[frame]} `}
        </Text>
        <Text color={primary} bold>
          {title}
        </Text>
        <Text color={dim}>  ·  </Text>
        <Text color={info}>{branches.length}</Text>
        <Text color={dim}> agents</Text>
        {running > 0 && (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={info}>{running} running</Text>
          </>
        )}
        {completed > 0 && (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={success}>{completed} done</Text>
          </>
        )}
        {failed > 0 && (
          <>
            <Text color={dim}>  ·  </Text>
            <Text color={error}>{failed} failed</Text>
          </>
        )}
        <Text color={dim}>  ·  </Text>
        <Text color={dim}>{formatElapsed(totalElapsed)}</Text>
      </Box>

      {branches.map((b, i) => {
        const isLast = i === branches.length - 1;
        const connector = isLast ? "└─" : "├─";
        const color = statusColor(b.status);
        return (
          <Box key={`${b.agentId}-${i}`}>
            <Text color={dim}>  {connector} </Text>
            <Text color={color}>{STATUS_ICON[b.status]} </Text>
            <Text color={primary} bold>
              {b.agentId}
            </Text>
            <Text color={dim}>  </Text>
            <Text color={b.status === "failed" ? error : dim}>{b.detail}</Text>
            {b.elapsedMs > 0 && (
              <>
                <Text color={dim}>  ·  </Text>
                <Text color={dim}>{formatElapsed(b.elapsedMs)}</Text>
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
