import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { groupCommandsForHelp, MORNINGSTAR_COMMAND_REGISTRY } from "../command-registry.js";
import { getTerminalDensity } from "../tui-layout.js";
const MENTIONS = [
    ["@file:<path>", "Datei als Kontext anhängen"],
    ["@files:<glob>", "Mehrere Dateien per Glob"],
    ["@folder:<path>", "Ordner als Kontext anhängen"],
    ["@git:diff", "Git-Diff als Kontext"],
    ["@git:status", "Git-Status als Kontext"],
    ["@tree", "Verzeichnisbaum als Kontext"],
    ["@url:<url>", "Webseite als Kontext"],
];
const SHORTCUTS = [
    ["Ctrl+C", "Markierung kopieren; sonst Lauf abbrechen / beenden"],
    ["Shift+← / →", "Text markieren; mit Ctrl wortweise"],
    ["Ctrl+S / Ctrl+X", "Gesamte Eingabe markieren / Auswahl ausschneiden"],
    ["Alt+Enter", "Neue Zeile in der Eingabe"],
    ["Maus + Cmd+C", "Terminal-Ausgabe markieren und kopieren (Mac)"],
    ["Ctrl+O", "Letzte Tool-Gruppe ein-/ausklappen"],
    ["↑ / ↓", "Eingabeverlauf oder Auswahl navigieren"],
    ["Tab / Shift+Tab", "Modus vor/zurück; Tab vervollständigt offene Vorschläge"],
    ["Esc", "Auswahl oder wartende Eingabe verwerfen"],
    ["!<cmd>", "Shell-Befehl über die Permission-Schicht ausführen"],
];
export function Help() {
    const { primary, accent, info, dim } = useTheme();
    const columns = useTerminalColumns();
    const density = getTerminalDensity(columns);
    const commandWidth = density === "compact" ? 24 : 34;
    const groups = groupCommandsForHelp(MORNINGSTAR_COMMAND_REGISTRY);
    const renderRows = (items) => (items.map(([command, description]) => (_jsxs(Text, { children: [_jsx(Text, { color: primary, children: `  ${command.padEnd(commandWidth)}` }), _jsx(Text, { color: dim, children: description })] }, command))));
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 1, marginY: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: accent, children: "\u2726 " }), _jsx(Text, { color: primary, bold: true, children: "Morningstar commands" }), _jsx(Text, { color: dim, children: "  \u00B7  nur verf\u00FCgbare Funktionen" })] }), groups.map((group) => (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: info, bold: true, children: group.title }), group.commands.map((command) => (_jsxs(Text, { children: [_jsx(Text, { color: primary, children: `  ${command.usage.padEnd(commandWidth)}` }), _jsx(Text, { color: dim, children: command.description })] }, command.id)))] }, group.category))), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: info, bold: true, children: "Kontext-Mentions" }), renderRows(MENTIONS)] }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: info, bold: true, children: "Tastatur" }), renderRows(SHORTCUTS)] })] }));
}
//# sourceMappingURL=Help.js.map