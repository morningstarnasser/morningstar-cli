import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";

interface HelpSection {
  title: string;
  items: Array<{ cmd: string; desc: string }>;
}

const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Allgemein",
    items: [
      { cmd: "/help", desc: "Diese Hilfe anzeigen" },
      { cmd: "/features", desc: "Alle Features anzeigen" },
      { cmd: "/clear", desc: "Konversation zuruecksetzen" },
      { cmd: "/compact", desc: "Konversation komprimieren" },
      { cmd: "/export", desc: "Konversation als Markdown exportieren" },
      { cmd: "/copy", desc: "Letzte Antwort in Zwischenablage" },
      { cmd: "/rename <name>", desc: "Session umbenennen" },
      { cmd: "/rewind [n]", desc: "Letzte N Messages entfernen" },
      { cmd: "/debug", desc: "Debug-Modus an/aus" },
      { cmd: "/statusline", desc: "Status-Bar an/aus" },
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
      { cmd: "/permissions <mode>", desc: "Permission-Modus (auto/ask/strict/...)" },
      { cmd: "/settings", desc: "Projekt-Settings anzeigen/verwalten" },
      { cmd: "/plan", desc: "Plan-Modus an/aus" },
      { cmd: "/think", desc: "Think-Modus an/aus" },
      { cmd: "/effort <level>", desc: "Thinking Effort (low/medium/high/ultra)" },
      { cmd: "/ultrathink", desc: "Ultra-Think Modus an/aus" },
      { cmd: "/max-turns <n>", desc: "Max Auto-Fix Durchlaeufe (1-50)" },
      { cmd: "/review [pfad]", desc: "Code-Review" },
    ],
  },
  {
    title: "Agenten & Delegation",
    items: [
      { cmd: "/agents", desc: "Verfuegbare Agenten anzeigen" },
      { cmd: "/agent:<id>", desc: "Agent aktivieren" },
      { cmd: "/agent:off", desc: "Agent deaktivieren" },
      { cmd: "/agent:create", desc: "Neuen Agent erstellen (.md)" },
      { cmd: "/agent:edit <id>", desc: "Custom Agent bearbeiten" },
      { cmd: "/agent:delete <id>", desc: "Custom Agent loeschen" },
      { cmd: "/agent:show <id>", desc: "Agent-Details anzeigen" },
      { cmd: "/agent:migrate", desc: "Agents zu .md migrieren" },
      { cmd: "/delegate <agent> <task>", desc: "Task an Sub-Agent delegieren" },
      { cmd: "/delegate:list", desc: "Verfuegbare Sub-Agents anzeigen" },
    ],
  },
  {
    title: "Skills & Rules",
    items: [
      { cmd: "/skill:list", desc: "Alle Skills anzeigen" },
      { cmd: "/skill:create", desc: "Neuen Skill erstellen (.md)" },
      { cmd: "/skill:<id>", desc: "Skill aktivieren" },
      { cmd: "/skill:off", desc: "Skill deaktivieren" },
      { cmd: "/rules list", desc: "Alle Rules anzeigen" },
      { cmd: "/rules add <name>", desc: "Neue Rule erstellen (.md)" },
    ],
  },
  {
    title: "Agent Teams",
    items: [
      { cmd: "/team list", desc: "Teams anzeigen" },
      { cmd: "/team create <name>", desc: "Neues Team erstellen" },
      { cmd: "/team delete <name>", desc: "Team loeschen" },
      { cmd: "/team run <name> <task>", desc: "Team ausfuehren" },
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
    title: "Git & Checkpoints",
    items: [
      { cmd: "/diff", desc: "Git diff anzeigen" },
      { cmd: "/diff staged", desc: "Staged changes anzeigen" },
      { cmd: "/commit", desc: "Smart Commit" },
      { cmd: "/log", desc: "Git log anzeigen" },
      { cmd: "/status", desc: "Git status" },
      { cmd: "/checkpoint", desc: "Git-Checkpoint erstellen" },
      { cmd: "/checkpoint list", desc: "Checkpoints anzeigen" },
      { cmd: "/checkpoint restore <id>", desc: "Checkpoint wiederherstellen" },
    ],
  },
  {
    title: "Codebase-Analyse",
    items: [
      { cmd: "/onboard", desc: "Projekt-Onboarding" },
      { cmd: "/score", desc: "Projekt-Qualitaetsscore" },
      { cmd: "/roast", desc: "Code Roast" },
      { cmd: "/map", desc: "Codebase Map" },
      { cmd: "/graph", desc: "Dependency Graph (ASCII)" },
      { cmd: "/pr-review [url|nr]", desc: "Smart PR Review" },
    ],
  },
  {
    title: "Dateien & Projekt",
    items: [
      { cmd: "/init", desc: "MORNINGSTAR.md erstellen" },
      { cmd: "/undo", desc: "Letzte Aenderung rueckgaengig" },
      { cmd: "/search <query>", desc: "Im Projekt suchen" },
      { cmd: "/watch", desc: "File Watcher an/aus" },
      { cmd: "/cd <path>", desc: "Verzeichnis wechseln (smart)" },
    ],
  },
  {
    title: "History & Sessions",
    items: [
      { cmd: "/history save <n>", desc: "Konversation speichern" },
      { cmd: "/history list", desc: "Gespeicherte Sessions" },
      { cmd: "/history load <id>", desc: "Session laden" },
      { cmd: "/branch", desc: "Konversation verzweigen" },
      { cmd: "/branch list", desc: "Branches anzeigen" },
      { cmd: "/branch switch <id>", desc: "Branch wechseln" },
      { cmd: "/branch merge <id>", desc: "Branch mergen" },
    ],
  },
  {
    title: "@-Mentions (im Prompt)",
    items: [
      { cmd: "@file:<path>", desc: "Datei als Kontext anhaengen" },
      { cmd: "@files:<glob>", desc: "Mehrere Dateien per Glob-Pattern" },
      { cmd: "@folder:<path>", desc: "Ordner-Inhalt als Kontext" },
      { cmd: "@git:diff", desc: "Git diff als Kontext" },
      { cmd: "@git:log", desc: "Git log als Kontext" },
      { cmd: "@git:status", desc: "Git status als Kontext" },
      { cmd: "@diff:<file>", desc: "Diff einer bestimmten Datei" },
      { cmd: "@tree", desc: "Verzeichnisbaum als Kontext" },
      { cmd: "@url:<url>", desc: "Webseite als Kontext" },
      { cmd: "@codebase", desc: "Codebase-Map als Kontext" },
    ],
  },
  {
    title: "Vision & Bilder",
    items: [
      { cmd: "/vision <path>", desc: "Bild analysieren (Ollama)" },
      { cmd: "/imagine <prompt>", desc: "Bild generieren (6 Models)" },
      { cmd: "/serve", desc: "API Server starten" },
    ],
  },
  {
    title: "Darstellung & Modes",
    items: [
      { cmd: "/theme [id]", desc: "Theme anzeigen/wechseln (7 Themes)" },
      { cmd: "/fast", desc: "Fast mode an/aus (leichteres Model)" },
      { cmd: "/vim", desc: "Vim keybindings an/aus" },
      { cmd: "/terminal-setup", desc: "Terminal-Bindings (Shift+Enter)" },
      { cmd: "/config", desc: "Konfiguration anzeigen" },
      { cmd: "/doctor", desc: "Setup diagnostizieren" },
    ],
  },
  {
    title: "Dashboard & Updates",
    items: [
      { cmd: "/dashboard [port]", desc: "Web Dashboard starten (Browser)" },
      { cmd: "/update", desc: "Auf Updates pruefen" },
      { cmd: "/update run", desc: "Self-Update ausfuehren" },
    ],
  },
  {
    title: "Plugins & Integrationen",
    items: [
      { cmd: "/plugins", desc: "Installierte Plugins anzeigen" },
      { cmd: "/mcp", desc: "MCP Server verwalten" },
      { cmd: "/hooks", desc: "Lifecycle Hooks anzeigen" },
      { cmd: "/chrome", desc: "Chrome Integration" },
      { cmd: "/sandbox", desc: "Sandbox-Modus an/aus" },
    ],
  },
  {
    title: "Account & System",
    items: [
      { cmd: "/login [provider]", desc: "API Key setzen" },
      { cmd: "/logout", desc: "API Key entfernen" },
      { cmd: "/bug", desc: "Bug Report oeffnen" },
    ],
  },
  {
    title: "Keyboard Shortcuts",
    items: [
      { cmd: "ctrl+o", desc: "Tool-Gruppe expand/collapse" },
      { cmd: "ctrl+c", desc: "Abbrechen / Beenden" },
      { cmd: "ctrl+b", desc: "Background Info" },
      { cmd: "ctrl+r", desc: "History durchsuchen" },
      { cmd: "Esc+Esc", desc: "Rewind (letzte Message entfernen)" },
      { cmd: "! <cmd>", desc: "Shell-Befehl direkt ausfuehren" },
    ],
  },
];

export function Help() {
  const { primary, info, dim } = useTheme();

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      <Text color={info}>{"\n"}  Morningstar CLI - Alle Befehle:{"\n"}</Text>
      {HELP_SECTIONS.map((section) => (
        <Box key={section.title} flexDirection="column" marginBottom={1}>
          <Text color={primary} bold>  {section.title}</Text>
          {section.items.map((item) => (
            <Text key={item.cmd}>
              {"  "}<Text>{item.cmd.padEnd(28)}</Text> <Text color={dim}>{item.desc}</Text>
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
