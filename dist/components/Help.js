import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
const HELP_SECTIONS = [
    {
        title: "Allgemein",
        items: [
            { cmd: "/help", desc: "Diese Hilfe anzeigen" },
            { cmd: "/features", desc: "Alle Features anzeigen" },
            { cmd: "/clear", desc: "Konversation zuruecksetzen" },
            { cmd: "/compact", desc: "Konversation komprimieren" },
            { cmd: "/quit", desc: "Beenden" },
        ],
    },
    {
        title: "AI & Model",
        items: [
            { cmd: "/model <id>", desc: "Model wechseln (alle Provider)" },
            { cmd: "/provider <name>", desc: "Provider wechseln" },
            { cmd: "/providers", desc: "Alle Provider und Models anzeigen" },
            { cmd: "/context", desc: "Projekt-Kontext anzeigen" },
            { cmd: "/cost", desc: "Token- & Kostentracking anzeigen" },
            { cmd: "/stats", desc: "Session-Statistiken" },
            { cmd: "/permissions", desc: "Permission-Modus (auto/ask/strict)" },
            { cmd: "/settings", desc: "Projekt-Settings anzeigen/verwalten" },
            { cmd: "/plan", desc: "Plan-Modus an/aus" },
            { cmd: "/think", desc: "Think-Modus an/aus" },
            { cmd: "/review [pfad]", desc: "Code-Review" },
        ],
    },
    {
        title: "Agenten",
        items: [
            { cmd: "/agents", desc: "Verfuegbare Agenten anzeigen" },
            { cmd: "/agent:<id>", desc: "Agent aktivieren" },
            { cmd: "/agent:off", desc: "Agent deaktivieren" },
            { cmd: "/agent:create", desc: "Neuen Agent erstellen" },
            { cmd: "/agent:edit <id>", desc: "Custom Agent bearbeiten" },
            { cmd: "/agent:delete <id>", desc: "Custom Agent loeschen" },
            { cmd: "/agent:show <id>", desc: "Agent-Details anzeigen" },
            { cmd: "/agent:export <id>", desc: "Agent als JSON exportieren" },
            { cmd: "/agent:import", desc: "Agent aus JSON importieren" },
        ],
    },
    {
        title: "Notizen & Aufgaben",
        items: [
            { cmd: "/memory add <text>", desc: "Notiz speichern" },
            { cmd: "/memory list", desc: "Alle Notizen anzeigen" },
            { cmd: "/memory search <q>", desc: "Notizen durchsuchen" },
            { cmd: "/todo add <text>", desc: "Aufgabe hinzufuegen" },
            { cmd: "/todo list", desc: "Aufgaben anzeigen" },
            { cmd: "/todo done <id>", desc: "Aufgabe als erledigt markieren" },
        ],
    },
    {
        title: "Git",
        items: [
            { cmd: "/diff", desc: "Git diff anzeigen" },
            { cmd: "/diff staged", desc: "Staged changes anzeigen" },
            { cmd: "/commit", desc: "Smart Commit" },
            { cmd: "/log", desc: "Git log anzeigen" },
            { cmd: "/branch", desc: "Branches anzeigen" },
            { cmd: "/status", desc: "Git status" },
        ],
    },
    {
        title: "Codebase-Analyse",
        items: [
            { cmd: "/onboard", desc: "Projekt-Onboarding" },
            { cmd: "/score", desc: "Projekt-Qualitaetsscore" },
            { cmd: "/roast", desc: "Code Roast" },
            { cmd: "/map", desc: "Codebase Map" },
        ],
    },
    {
        title: "Dateien & Projekt",
        items: [
            { cmd: "/init", desc: "MORNINGSTAR.md erstellen" },
            { cmd: "/undo", desc: "Letzte Aenderung rueckgaengig" },
            { cmd: "/search <query>", desc: "Im Projekt suchen" },
        ],
    },
    {
        title: "History & Sessions",
        items: [
            { cmd: "/history save <n>", desc: "Konversation speichern" },
            { cmd: "/history list", desc: "Gespeicherte Sessions" },
            { cmd: "/history load <id>", desc: "Session laden" },
        ],
    },
    {
        title: "@-Mentions (im Prompt)",
        items: [
            { cmd: "@file:<path>", desc: "Datei als Kontext anhaengen" },
            { cmd: "@folder:<path>", desc: "Ordner-Inhalt als Kontext" },
            { cmd: "@git:diff", desc: "Git diff als Kontext" },
            { cmd: "@codebase", desc: "Codebase-Map als Kontext" },
        ],
    },
    {
        title: "Vision & Bilder",
        items: [
            { cmd: "/vision <path>", desc: "Bild analysieren (Ollama)" },
            { cmd: "/imagine <prompt>", desc: "Bild generieren (Stable Diffusion)" },
            { cmd: "/serve", desc: "API Server starten" },
        ],
    },
    {
        title: "Darstellung",
        items: [
            { cmd: "/theme", desc: "Theme anzeigen/wechseln" },
            { cmd: "/config", desc: "Konfiguration anzeigen" },
            { cmd: "/doctor", desc: "Setup diagnostizieren" },
        ],
    },
    {
        title: "Modes & Tools",
        items: [
            { cmd: "/fast", desc: "Fast mode an/aus (leichteres Model)" },
            { cmd: "/vim", desc: "Vim keybindings an/aus" },
            { cmd: "/terminal-setup", desc: "Terminal-Bindings (Shift+Enter)" },
        ],
    },
    {
        title: "Account & System",
        items: [
            { cmd: "/login [provider]", desc: "API Key setzen" },
            { cmd: "/logout", desc: "API Key entfernen" },
            { cmd: "/bug", desc: "Bug Report oeffnen" },
            { cmd: "/hooks", desc: "Lifecycle Hooks anzeigen" },
            { cmd: "/mcp", desc: "MCP Server Info" },
            { cmd: "/pr-comments [nr]", desc: "PR Review Comments laden" },
        ],
    },
    {
        title: "Keyboard Shortcuts",
        items: [
            { cmd: "ctrl+o", desc: "Tool-Gruppe expand/collapse" },
            { cmd: "ctrl+c", desc: "Abbrechen / Beenden" },
            { cmd: "ctrl+b", desc: "Background Info" },
        ],
    },
];
export function Help() {
    const { primary, info, dim } = useTheme();
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, marginY: 1, children: [_jsxs(Text, { color: info, children: ["\n", "  Morningstar CLI - Alle Befehle:", "\n"] }), HELP_SECTIONS.map((section) => (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { color: primary, bold: true, children: ["  ", section.title] }), section.items.map((item) => (_jsxs(Text, { children: ["  ", _jsx(Text, { children: item.cmd.padEnd(21) }), " ", _jsx(Text, { color: dim, children: item.desc })] }, item.cmd)))] }, section.title)))] }));
}
//# sourceMappingURL=Help.js.map