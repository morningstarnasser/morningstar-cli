import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { fitText } from "../tui-layout.js";
import { useTerminalDetail } from "../hooks/useTerminalDetails.js";
import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { displayText, fileChange, workHeading } from "../runtime/work-log.js";
import type { ToolResult } from "../types.js";

const GREEN = "#7bd88f", RED = "#ff7d7d", BODY = "#b5beca", COMMAND = "#a8c8fa";
function Counts({ added, removed }: { added: number; removed: number }) {
  return <Text>(<Text color={GREEN}>+{added}</Text> <Text color={RED}>-{removed}</Text>)</Text>;
}

/** Static, selectable factual output. Only the running status area animates. */
export function WorkLog({ results, agent }: { results: ToolResult[]; agent?: string }) {
  const t = useTheme();
  const entries = useMemo(() => results.map(r => ({ r, change: r.success && r.diff ? fileChange(r.diff.oldStr, r.diff.newStr, r.startLineNumber) : undefined })), [results]);
  const edits = entries.filter(e => e.change);
  const files = new Set(edits.map(e => e.r.filePath ?? e.r.diff!.filePath)).size;
  return <Box flexDirection="column" marginLeft={2} marginBottom={1}>
    {edits.length ? <Text><Text bold color={GREEN}>• Edited {files} file{files === 1 ? "" : "s"} </Text>
      <Counts added={edits.reduce((n, e) => n + e.change!.added, 0)} removed={edits.reduce((n, e) => n + e.change!.removed, 0)} />
      {agent ? <Text color={t.dim}> · {displayText(agent)}</Text> : null}
    </Text> : null}
    {entries.map(({ r }, index) => <WorkEntry key={index} result={r} agent={agent} />)}
  </Box>;
}

function WorkEntry({ result: r, agent }: { result: ToolResult; agent?: string }) {
  const t = useTheme(), columns = useTerminalColumns();
  const change = useMemo(() => r.success && r.diff ? fileChange(r.diff.oldStr, r.diff.newStr, r.startLineNumber, 8) : undefined, [r]);
  const full = useMemo(() => {
    if (!r.diff) return displayText(r.result);
    const diff = fileChange(r.diff.oldStr, r.diff.newStr, r.startLineNumber, Number.MAX_SAFE_INTEGER);
    return diff.lines.map(line => `${line.kind === "added" ? "\x1b[38;2;123;216;143;48;2;0;95;0m+" : line.kind === "removed" ? "\x1b[38;2;255;125;125;48;2;95;0;0m-" : " "} ${String(line.line).padStart(4)} ${displayText(line.text)}\x1b[0m`).join("\n") + "\n\n" + displayText(r.result);
  }, [r]);
  const detail = useTerminalDetail({ title: displayText(workHeading(r)), body: full });
  return <Box flexDirection="column">
      {change ? <>
        <Text><Text color={t.dim}>  └ </Text>{displayText(r.filePath ?? r.diff!.filePath)} <Counts added={change.added} removed={change.removed} /></Text>
        {change.lines.map((line, i) => <Text key={i} wrap="truncate" backgroundColor={line.kind === "added" ? "#005f00" : line.kind === "removed" ? "#5f0000" : undefined} color={line.kind === "added" ? GREEN : line.kind === "removed" ? RED : t.dim}>
          {fitText(`    ${String(line.line).padStart(4)} ${line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "} ${displayText(line.text)}`, Math.max(20, columns - 4)).padEnd(Math.max(20, columns - 4))}
        </Text>)}
        {change.omitted ? <Text color={t.dim}>    … {change.omitted} weitere Diff-Zeilen</Text> : null}
        {change.coarse ? <Text color={t.dim}>    Grosse Änderung: ersetzten Bereich vollständig gezählt.</Text> : null}
      </> : <>
        <Text wrap="truncate"><Text bold color={r.success ? GREEN : RED}>• {r.command ? displayText(workHeading(r).slice(0, -r.command.length)) : displayText(workHeading(r))}</Text>{r.command ? <Text color={COMMAND}>{fitText(displayText(r.command), Math.max(20, columns - 32))}</Text> : null}{agent ? <Text color={t.dim}> · {displayText(agent)}</Text> : null}</Text>
        {(r.tool === "swarm" ? [r.success ? "Team abgeschlossen; Berichte an Hauptagent übergeben." : "Team mit Fehlern; Hauptagent erhält Details."] : displayText(r.result).split("\n")).slice(0, 4).map((line, i) =>
          <Text key={i} wrap="truncate"><Text color={t.dim}>{i === 0 ? "  └ " : "    "}</Text><Text color={r.success ? BODY : RED}>{fitText(line, Math.max(20, columns - 8)) || " "}</Text></Text>)}
        {r.tool !== "swarm" && r.result.split("\n").length > 4 ? <Text color={t.dim}>    … {r.result.split("\n").length - 4} weitere Ausgabezeilen</Text> : null}
      </>}
      {detail ? <Text color={GREEN}>    {detail}</Text> : null}
    </Box>;
}
