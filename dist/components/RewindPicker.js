import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { rewindPoints } from "../runtime/rewind.js";
import { terminalReport } from "../runtime/composer-layout.js";
import { displayText } from "../runtime/work-log.js";
import { useTerminalHit } from "../hooks/useTerminalPointer.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { fitText } from "../tui-layout.js";
import { useTheme } from "../hooks/useTheme.js";
const actions = ["Gespräch wiederherstellen", "Ab hier zusammenfassen", "Bis hier zusammenfassen", "Abbrechen"];
function Row({ text, selected, choose }) {
    const node = useRef(null), theme = useTheme();
    useTerminalHit(node, e => { if (e.kind === "down")
        choose(); });
    return _jsx(Box, { ref: node, children: _jsxs(Text, { color: selected ? theme.accent : theme.primary, children: [selected ? "› " : "  ", text] }) });
}
export function RewindPicker({ messages, busy, onChoose, onClose }) {
    const points = rewindPoints(messages), [selected, setSelected] = useState(Math.max(0, points.length - 1)), [stage, setStage] = useState("messages"), [action, setAction] = useState(0);
    const t = useTheme(), columns = useTerminalColumns();
    const pick = (n) => { if (busy)
        return; setAction(n); if (n === 3)
        onClose();
    else if (points[selected])
        onChoose(points[selected].index, ["restore", "summarize-from", "summarize-until"][n]); };
    useInput((input, key) => {
        if (terminalReport(input))
            return;
        if (key.escape) {
            if (busy)
                onClose();
            else if (stage === "actions")
                setStage("messages");
            else
                onClose();
            return;
        }
        if (busy)
            return;
        if (key.upArrow || key.downArrow) {
            const step = key.upArrow ? -1 : 1;
            if (stage === "messages")
                setSelected(n => Math.max(0, Math.min(points.length - 1, n + step)));
            else
                setAction(n => (n + step + 4) % 4);
            return;
        }
        if (stage === "actions" && /^[1-4]$/.test(input)) {
            pick(Number(input) - 1);
            return;
        }
        if (key.return) {
            if (stage === "messages" && points.length)
                setStage("actions");
            else if (stage === "actions")
                pick(action);
        }
    });
    return _jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: t.accent, paddingX: 1, marginY: 1, children: [_jsx(Text, { bold: true, color: t.accent, children: "Rewind \u00B7 Gespr\u00E4chsverlauf" }), _jsx(Text, { color: t.dim, children: busy ? "Zusammenfassung wird erstellt … Esc bricht ab." : "Der Code bleibt unverändert. Eine Sicherung des bisherigen Gesprächs bleibt unter /resume erhalten." }), stage === "messages" ? _jsxs(_Fragment, { children: [_jsx(Text, { children: "Bis vor welche Nachricht m\u00F6chtest du zur\u00FCck?" }), points.slice(Math.max(0, selected - 5), Math.max(0, selected - 5) + 7).map(p => _jsx(Row, { text: fitText(displayText(p.text).replace(/\n/g, " "), columns - 10), selected: points[selected]?.index === p.index, choose: () => { if (!busy) {
                            setSelected(points.indexOf(p));
                            setStage("actions");
                        } } }, p.index)), !points.length ? _jsx(Text, { color: t.dim, children: "Noch keine Nachricht zum Zur\u00FCckspulen." }) : null] }) : _jsxs(_Fragment, { children: [_jsx(Text, { color: t.dim, children: fitText(displayText(points[selected]?.text ?? ""), columns - 8) }), _jsx(Text, { color: t.dim, children: action === 0 ? "Stellt den Verlauf vor dieser Nachricht wieder her; der Text erscheint zum Bearbeiten im Eingabefeld." : action === 1 ? "Fasst diese Nachricht und alles danach zusammen." : action === 2 ? "Fasst alles vor dieser Nachricht zusammen und behält den weiteren Verlauf." : "" }), actions.map((label, i) => _jsx(Row, { text: `${i + 1}. ${label}`, selected: i === action, choose: () => pick(i) }, label))] }), _jsx(Text, { color: t.dim, children: "\u2191/\u2193 w\u00E4hlen \u00B7 Enter best\u00E4tigen \u00B7 Esc zur\u00FCck" })] });
}
//# sourceMappingURL=RewindPicker.js.map