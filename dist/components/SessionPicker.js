import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { terminalReport } from "../runtime/composer-layout.js";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { displayText } from "../runtime/work-log.js";
export function SessionPicker({ sessions, onSelect, onClose }) {
    const t = useTheme();
    const [query, setQuery] = useState(""), [selected, setSelected] = useState(0);
    const matches = sessions.filter(s => `${s.name} ${s.id}`.toLowerCase().includes(query.toLowerCase()));
    useInput((input, key) => {
        if (terminalReport(input))
            return;
        if (key.escape) {
            onClose();
            return;
        }
        if (key.upArrow || key.downArrow) {
            setSelected(i => Math.max(0, Math.min(matches.length - 1, i + (key.upArrow ? -1 : 1))));
            return;
        }
        if (key.return) {
            if (matches[selected])
                onSelect(matches[selected].id);
            return;
        }
        if (key.backspace || key.delete) {
            setQuery(q => [...q].slice(0, -1).join(""));
            setSelected(0);
            return;
        }
        if (input && !key.ctrl && !key.meta) {
            setQuery(q => q + displayText(input));
            setSelected(0);
        }
    });
    return _jsxs(Box, { flexDirection: "column", marginX: 2, marginY: 1, children: [_jsx(Text, { color: t.primary, bold: true, children: "Sitzung fortsetzen" }), _jsxs(Text, { children: ["Suche: ", query || "Name oder ID eingeben"] }), matches.slice(Math.max(0, selected - 5), Math.max(0, selected - 5) + 8).map(s => _jsxs(Text, { color: matches[selected]?.id === s.id ? t.accent : t.dim, children: [matches[selected]?.id === s.id ? "› " : "  ", displayText(s.name), " \u00B7 ", s.messageCount, " Nachrichten \u00B7 ", s.savedAt.slice(0, 10)] }, s.id)), !matches.length ? _jsx(Text, { color: t.dim, children: "Keine passende Sitzung in diesem Projekt." }) : null, _jsx(Text, { color: t.dim, children: "\u2191/\u2193 w\u00E4hlen \u00B7 Enter fortsetzen \u00B7 Esc zur\u00FCck" })] });
}
//# sourceMappingURL=SessionPicker.js.map