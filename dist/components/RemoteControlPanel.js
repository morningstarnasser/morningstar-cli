import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalHit } from "../hooks/useTerminalPointer.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { terminalReport } from "../runtime/composer-layout.js";
import { qrRows } from "../terminal-qr.js";
function Option({ label, selected, choose }) {
    const node = useRef(null), t = useTheme();
    useTerminalHit(node, e => { if (e.kind === "down")
        choose(); });
    return _jsx(Box, { ref: node, children: _jsxs(Text, { color: selected ? t.accent : t.primary, children: [selected ? "› " : "  ", label] }) });
}
export function RemoteControlPanel({ url, onChoose }) {
    const [selected, setSelected] = useState(0), t = useTheme();
    const pick = (i) => onChoose(["qr", "stop", "close"][i]);
    useInput((input, key) => {
        if (terminalReport(input))
            return;
        if (key.escape)
            onChoose("close");
        else if (key.upArrow || key.downArrow)
            setSelected(n => (n + (key.upArrow ? 2 : 1)) % 3);
        else if (/^[1-3]$/.test(input))
            pick(Number(input) - 1);
        else if (key.return)
            pick(selected);
    });
    return _jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: t.accent, paddingX: 1, marginY: 1, children: [_jsx(Text, { bold: true, color: t.accent, children: "Remote Control \u00B7 aktiv" }), _jsx(Text, { color: t.dim, children: url }), _jsx(Text, { color: t.dim, children: "Deaktivieren trennt alle Ger\u00E4te. Deine lokale Sitzung l\u00E4uft weiter." }), ["QR-Code neu anzeigen", "Deaktivieren", "Zurück"].map((label, i) => _jsx(Option, { label: `${i + 1}. ${label}`, selected: selected === i, choose: () => pick(i) }, label)), _jsx(Text, { color: t.dim, children: "\u2191/\u2193 w\u00E4hlen \u00B7 Enter best\u00E4tigen \u00B7 Esc zur\u00FCck" })] });
}
export function RemotePairing({ url, label }) {
    const t = useTheme(), columns = useTerminalColumns(), rows = qrRows(url);
    return _jsxs(Box, { flexDirection: "column", marginLeft: 2, marginY: 1, children: [_jsxs(Text, { bold: true, color: t.accent, children: ["Remote Control \u00B7 ", label] }), columns >= rows[0].length + 4 ? rows.map((row, y) => _jsx(Text, { children: row.map((cell, x) => _jsx(Text, { color: cell.top ? "#000000" : "#ffffff", backgroundColor: cell.bottom ? "#000000" : "#ffffff", children: "\u2580" }, x)) }, y)) : _jsx(Text, { color: t.dim, children: "F\u00FCr den QR-Code das Terminal verbreitern oder den Link \u00F6ffnen." }), _jsx(Text, { color: t.accent, children: url }), _jsx(Text, { color: t.dim, children: "Einmalig \u00B7 10 Minuten g\u00FCltig \u00B7 /rc \u00F6ffnet das Verbindungsmen\u00FC" }), url.includes("//100.") ? _jsx(Text, { color: t.dim, children: "Auf dem Handy Tailscale im selben Netz einschalten." }) : null] });
}
//# sourceMappingURL=RemoteControlPanel.js.map