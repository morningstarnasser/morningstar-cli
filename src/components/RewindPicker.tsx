import React, { useRef, useState } from "react";
import { Box, Text, useInput, type DOMElement } from "ink";
import type { Message } from "../types.js";
import { rewindPoints, type RewindAction } from "../runtime/rewind.js";
import { terminalReport } from "../runtime/composer-layout.js";
import { displayText } from "../runtime/work-log.js";
import { useTerminalHit } from "../hooks/useTerminalPointer.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { fitText } from "../tui-layout.js";
import { useTheme } from "../hooks/useTheme.js";
const actions = ["Gespräch wiederherstellen", "Ab hier zusammenfassen", "Bis hier zusammenfassen", "Abbrechen"];
function Row({ text, selected, choose }: { text: string; selected: boolean; choose: () => void }) {
  const node = useRef<DOMElement>(null), theme = useTheme();
  useTerminalHit(node, e => { if (e.kind === "down") choose(); });
  return <Box ref={node}><Text color={selected ? theme.accent : theme.primary}>{selected ? "› " : "  "}{text}</Text></Box>;
}
export function RewindPicker({ messages, busy, onChoose, onClose }: { messages: Message[]; busy: boolean; onChoose: (index: number, action: RewindAction) => void; onClose: () => void }) {
  const points = rewindPoints(messages), [selected, setSelected] = useState(Math.max(0, points.length - 1)), [stage, setStage] = useState<"messages" | "actions">("messages"), [action, setAction] = useState(0);
  const t = useTheme(), columns = useTerminalColumns();
  const pick = (n: number) => { if (busy) return; setAction(n); if (n === 3) onClose(); else if (points[selected]) onChoose(points[selected].index, (["restore", "summarize-from", "summarize-until"] as const)[n]); };
  useInput((input, key) => {
    if (terminalReport(input)) return;
    if (key.escape) { if (busy) onClose(); else if (stage === "actions") setStage("messages"); else onClose(); return; }
    if (busy) return;
    if (key.upArrow || key.downArrow) { const step = key.upArrow ? -1 : 1; if (stage === "messages") setSelected(n => Math.max(0, Math.min(points.length - 1, n + step))); else setAction(n => (n + step + 4) % 4); return; }
    if (stage === "actions" && /^[1-4]$/.test(input)) { pick(Number(input) - 1); return; }
    if (key.return) { if (stage === "messages" && points.length) setStage("actions"); else if (stage === "actions") pick(action); }
  });
  return <Box flexDirection="column" borderStyle="round" borderColor={t.accent} paddingX={1} marginY={1}>
    <Text bold color={t.accent}>Rewind · Gesprächsverlauf</Text>
    <Text color={t.dim}>{busy ? "Zusammenfassung wird erstellt … Esc bricht ab." : "Der Code bleibt unverändert. Eine Sicherung des bisherigen Gesprächs bleibt unter /resume erhalten."}</Text>
    {stage === "messages" ? <>
      <Text>Bis vor welche Nachricht möchtest du zurück?</Text>
      {points.slice(Math.max(0, selected - 5), Math.max(0, selected - 5) + 7).map(p => <Row key={p.index} text={fitText(displayText(p.text).replace(/\n/g, " "), columns - 10)} selected={points[selected]?.index === p.index} choose={() => { if (!busy) { setSelected(points.indexOf(p)); setStage("actions"); } }} />)}
      {!points.length ? <Text color={t.dim}>Noch keine Nachricht zum Zurückspulen.</Text> : null}
    </> : <>
      <Text color={t.dim}>{fitText(displayText(points[selected]?.text ?? ""), columns - 8)}</Text>
      <Text color={t.dim}>{action === 0 ? "Stellt den Verlauf vor dieser Nachricht wieder her; der Text erscheint zum Bearbeiten im Eingabefeld." : action === 1 ? "Fasst diese Nachricht und alles danach zusammen." : action === 2 ? "Fasst alles vor dieser Nachricht zusammen und behält den weiteren Verlauf." : ""}</Text>
      {actions.map((label, i) => <Row key={label} text={`${i + 1}. ${label}`} selected={i === action} choose={() => pick(i)} />)}
    </>}
    <Text color={t.dim}>↑/↓ wählen · Enter bestätigen · Esc zurück</Text>
  </Box>;
}
