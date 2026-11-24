import React, { useRef, useState } from "react";
import { Box, Text, useInput, type DOMElement } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalHit } from "../hooks/useTerminalPointer.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { terminalReport } from "../runtime/composer-layout.js";
import { qrRows } from "../terminal-qr.js";

function Option({ label, selected, choose }: { label: string; selected: boolean; choose: () => void }) {
  const node = useRef<DOMElement>(null), t = useTheme();
  useTerminalHit(node, e => { if (e.kind === "down") choose(); });
  return <Box ref={node}><Text color={selected ? t.accent : t.primary}>{selected ? "› " : "  "}{label}</Text></Box>;
}
export function RemoteControlPanel({ url, onChoose }: { url: string; onChoose: (choice: "qr" | "stop" | "close") => void }) {
  const [selected, setSelected] = useState(0), t = useTheme();
  const pick = (i: number) => onChoose((["qr", "stop", "close"] as const)[i]);
  useInput((input, key) => {
    if (terminalReport(input)) return;
    if (key.escape) onChoose("close");
    else if (key.upArrow || key.downArrow) setSelected(n => (n + (key.upArrow ? 2 : 1)) % 3);
    else if (/^[1-3]$/.test(input)) pick(Number(input) - 1);
    else if (key.return) pick(selected);
  });
  return <Box flexDirection="column" borderStyle="round" borderColor={t.accent} paddingX={1} marginY={1}>
    <Text bold color={t.accent}>Remote Control · aktiv</Text><Text color={t.dim}>{url}</Text>
    <Text color={t.dim}>Deaktivieren trennt alle Geräte. Deine lokale Sitzung läuft weiter.</Text>
    {["QR-Code neu anzeigen", "Deaktivieren", "Zurück"].map((label, i) => <Option key={label} label={`${i + 1}. ${label}`} selected={selected === i} choose={() => pick(i)} />)}
    <Text color={t.dim}>↑/↓ wählen · Enter bestätigen · Esc zurück</Text>
  </Box>;
}
export function RemotePairing({ url, label }: { url: string; label: string }) {
  const t = useTheme(), columns = useTerminalColumns(), rows = qrRows(url);
  return <Box flexDirection="column" marginLeft={2} marginY={1}>
    <Text bold color={t.accent}>Remote Control · {label}</Text>
    {columns >= rows[0].length + 4 ? rows.map((row, y) => <Text key={y}>{row.map((cell, x) => <Text key={x} color={cell.top ? "#000000" : "#ffffff"} backgroundColor={cell.bottom ? "#000000" : "#ffffff"}>▀</Text>)}</Text>) : <Text color={t.dim}>Für den QR-Code das Terminal verbreitern oder den Link öffnen.</Text>}
    <Text color={t.accent}>{url}</Text>
    <Text color={t.dim}>Einmalig · 10 Minuten gültig · /rc öffnet das Verbindungsmenü</Text>
    {url.includes("//100.") ? <Text color={t.dim}>Auf dem Handy Tailscale im selben Netz einschalten.</Text> : null}
  </Box>;
}
