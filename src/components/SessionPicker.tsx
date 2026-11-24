import { terminalReport } from "../runtime/composer-layout.js";
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SessionController } from "../session-controller.js";
import { useTheme } from "../hooks/useTheme.js";
import { displayText } from "../runtime/work-log.js";

export function SessionPicker({ sessions, onSelect, onClose }: { sessions: ReturnType<SessionController["list"]>; onSelect: (id: string) => void; onClose: () => void }) {
  const t = useTheme(); const [query, setQuery] = useState(""), [selected, setSelected] = useState(0);
  const matches = sessions.filter(s => `${s.name} ${s.id}`.toLowerCase().includes(query.toLowerCase()));
  useInput((input, key) => {
    if (terminalReport(input)) return;
    if (key.escape) { onClose(); return; }
    if (key.upArrow || key.downArrow) { setSelected(i => Math.max(0, Math.min(matches.length - 1, i + (key.upArrow ? -1 : 1)))); return; }
    if (key.return) { if (matches[selected]) onSelect(matches[selected].id); return; }
    if (key.backspace || key.delete) { setQuery(q => [...q].slice(0, -1).join("")); setSelected(0); return; }
    if (input && !key.ctrl && !key.meta) { setQuery(q => q + displayText(input)); setSelected(0); }
  });
  return <Box flexDirection="column" marginX={2} marginY={1}>
    <Text color={t.primary} bold>Sitzung fortsetzen</Text>
    <Text>Suche: {query || "Name oder ID eingeben"}</Text>
    {matches.slice(Math.max(0, selected - 5), Math.max(0, selected - 5) + 8).map(s => <Text key={s.id} color={matches[selected]?.id === s.id ? t.accent : t.dim}>
      {matches[selected]?.id === s.id ? "› " : "  "}{displayText(s.name)} · {s.messageCount} Nachrichten · {s.savedAt.slice(0, 10)}
    </Text>)}
    {!matches.length ? <Text color={t.dim}>Keine passende Sitzung in diesem Projekt.</Text> : null}
    <Text color={t.dim}>↑/↓ wählen · Enter fortsetzen · Esc zurück</Text>
  </Box>;
}
