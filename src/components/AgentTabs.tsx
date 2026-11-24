import React, { useRef, useState } from "react";
import { Box, Text, type DOMElement } from "ink";
import { useTerminalHit } from "../hooks/useTerminalPointer.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { useTheme } from "../hooks/useTheme.js";
import type { AgentBranch } from "./AgentTree.js";
import { displayText } from "../runtime/work-log.js";
function Tab({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  const ref = useRef<DOMElement>(null), t = useTheme();
  useTerminalHit(ref, e => { if (e.kind === "down") onSelect(); });
  return <Box ref={ref} marginRight={1}><Text color={selected ? "#151916" : t.accent} backgroundColor={selected ? t.accent : undefined}> {label} </Text></Box>;
}
export function AgentTabs({ branches, selected, onSelect }: { branches: AgentBranch[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const [page, setPage] = useState(0), columns = useTerminalColumns();
  const count = Math.max(1, Math.floor((columns - 24) / 28)), pages = Math.ceil(branches.length / count), currentPage = Math.min(page, Math.max(0, pages - 1));
  if (!branches.length) return null;
  return <Box flexWrap="wrap" marginLeft={1}>
    <Tab label="Alle" selected={!selected} onSelect={() => onSelect(null)} />
    {branches.slice(currentPage * count, (currentPage + 1) * count).map((b, i) => { const id = b.taskId ?? b.agentId; return <Tab key={id} label={`${currentPage * count + i + 1} ${b.status === "running" ? "●" : b.status === "completed" ? "✓" : b.status === "failed" ? "✘" : "○"} ${displayText(b.taskId && !b.taskId.match(/^[0-9a-f-]{20,}$/) ? b.taskId : b.agentId).slice(0, 22)}`} selected={selected === id} onSelect={() => onSelect(id)} />; })}
    {pages > 1 ? <><Tab label="‹" selected={false} onSelect={() => setPage(n => (n - 1 + pages) % pages)} /><Text>{currentPage + 1}/{pages} </Text><Tab label="›" selected={false} onSelect={() => setPage(n => (n + 1) % pages)} /></> : null}
  </Box>;
}
