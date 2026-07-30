import React from "react";
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
] as const;

const SHORTCUTS = [
  ["Ctrl+C", "Aktiven Lauf abbrechen; erneut drücken beendet"],
  ["Ctrl+O", "Letzte Tool-Gruppe ein-/ausklappen"],
  ["↑ / ↓", "Eingabeverlauf oder Auswahl navigieren"],
  ["Tab", "Command- oder Datei-Vervollständigung"],
  ["Esc", "Auswahl oder wartende Eingabe verwerfen"],
  ["!<cmd>", "Shell-Befehl über die Permission-Schicht ausführen"],
] as const;

export function Help() {
  const { primary, accent, info, dim } = useTheme();
  const columns = useTerminalColumns();
  const density = getTerminalDensity(columns);
  const commandWidth = density === "compact" ? 24 : 34;
  const groups = groupCommandsForHelp(MORNINGSTAR_COMMAND_REGISTRY);

  const renderRows = (items: readonly (readonly [string, string])[]) => (
    items.map(([command, description]) => (
      <Text key={command}>
        <Text color={primary}>{`  ${command.padEnd(commandWidth)}`}</Text>
        <Text color={dim}>{description}</Text>
      </Text>
    ))
  );

  return (
    <Box flexDirection="column" marginLeft={1} marginY={1}>
      <Text>
        <Text color={accent}>✦ </Text>
        <Text color={primary} bold>Morningstar commands</Text>
        <Text color={dim}>  ·  nur verfügbare Funktionen</Text>
      </Text>

      {groups.map((group) => (
        <Box key={group.category} flexDirection="column" marginTop={1}>
          <Text color={info} bold>{group.title}</Text>
          {group.commands.map((command) => (
            <Text key={command.id}>
              <Text color={primary}>{`  ${command.usage.padEnd(commandWidth)}`}</Text>
              <Text color={dim}>{command.description}</Text>
            </Text>
          ))}
        </Box>
      ))}

      <Box flexDirection="column" marginTop={1}>
        <Text color={info} bold>Kontext-Mentions</Text>
        {renderRows(MENTIONS)}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={info} bold>Tastatur</Text>
        {renderRows(SHORTCUTS)}
      </Box>
    </Box>
  );
}
