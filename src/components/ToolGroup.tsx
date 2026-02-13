import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { ClaudeCodeDiff } from "./ClaudeCodeDiff.js";
import type { ToolResult as ToolResultType } from "../types.js";

// Tool display names
const TOOL_LABELS: Record<string, string> = {
  read: "Read", write: "Write", edit: "Update", delete: "Delete",
  bash: "Bash", "auto-bash": "Bash", "auto-python": "Python",
  grep: "Search", glob: "Glob", ls: "List", git: "Git",
  web: "WebSearch", fetch: "Fetch", gh: "GitHub", create: "Create", mkdir: "Create",
};

const TOOL_COLORS: Record<string, string> = {
  read: "#60a5fa", write: "#34d399", edit: "#fbbf24", delete: "#f87171",
  bash: "#a78bfa", grep: "#38bdf8", glob: "#38bdf8", ls: "#94a3b8",
  git: "#fb923c", web: "#2dd4bf", fetch: "#2dd4bf", gh: "#e879f9",
};

function getToolArg(tool: string, filePath?: string, command?: string): string {
  if (filePath) return filePath;
  if (command) return command.length > 60 ? command.slice(0, 57) + "..." : command;
  return "";
}

function getShortSummary(r: ToolResultType): string {
  if (!r.success) return r.result.split("\n")[0]?.slice(0, 60) || "Failed";
  switch (r.tool) {
    case "read": return `${r.linesChanged || "?"} lines`;
    case "write": return `${r.linesChanged || "?"} lines written`;
    case "edit": {
      if (r.diff) {
        const added = r.diff.newStr.split("\n").length;
        const removed = r.diff.oldStr.split("\n").length;
        return `${added} added, ${removed} removed`;
      }
      return `${r.linesChanged ? r.linesChanged + " lines changed" : "updated"}`;
    }
    case "delete": return "Deleted";
    case "bash": case "auto-bash": case "auto-python": {
      const lines = r.result.split("\n").filter(l => l.trim());
      return lines.length === 0 ? "(no output)" : `${lines.length} lines output`;
    }
    case "grep": {
      const matches = r.result.split("\n").filter(l => l.trim()).length;
      return matches === 0 ? "No matches" : `${matches} matches`;
    }
    case "glob": {
      const files = r.result.split("\n").filter(l => l.trim()).length;
      return files === 0 ? "No files" : `${files} files`;
    }
    default: return "Done";
  }
}

// Tools that show multi-line output
const FULL_OUTPUT_TOOLS = new Set(["bash", "auto-bash", "auto-python", "grep", "glob", "ls", "git", "web", "fetch"]);
const MAX_EXPANDED_LINES = 12;
const MAX_SINGLE_LINES = 20;

interface ToolGroupProps {
  results: ToolResultType[];
  duration: number;
  tokenCount: number;
  expanded: boolean;
  label?: string;
  toolUseCount: number;
}

// ─── Single Tool View (Claude Code style) ────────────────
// Shows: ⏺ Read(src/app.tsx)
//          ⎿  342 lines
function SingleToolView({ r }: { r: ToolResultType }) {
  const { primary, dim, error } = useTheme();
  const toolLabel = TOOL_LABELS[r.tool] || r.tool;
  const toolColor = r.success ? (TOOL_COLORS[r.tool] || primary) : error;
  const arg = getToolArg(r.tool, r.filePath, r.command);
  const hasDiff = r.tool === "edit" && r.diff && r.diff.oldStr && r.diff.newStr;
  const isFullOutput = FULL_OUTPUT_TOOLS.has(r.tool);
  const outputLines = r.result.split("\n").filter(l => l.trim());

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* Header: ⏺ ToolName(arg) */}
      <Text>
        <Text color={toolColor} bold>{"⏺ "}</Text>
        <Text color={toolColor} bold>{toolLabel}</Text>
        {arg && <Text color={dim}>({arg})</Text>}
      </Text>

      {/* Diff view for edit tools */}
      {hasDiff ? (
        <ClaudeCodeDiff
          oldStr={r.diff!.oldStr}
          newStr={r.diff!.newStr}
          startLineNumber={r.startLineNumber || 1}
          maxLines={30}
        />
      ) : r.success && isFullOutput && outputLines.length > 0 ? (
        /* Full output: bash, grep, etc */
        <Box flexDirection="column">
          <Text>
            <Text color={dim}>{"  \u23BF  "}</Text>
            <Text>{outputLines[0]}</Text>
          </Text>
          {outputLines.slice(1, MAX_SINGLE_LINES).map((line, i) => (
            <Text key={i}>
              <Text>{"     "}</Text>
              <Text>{line || " "}</Text>
            </Text>
          ))}
          {outputLines.length > MAX_SINGLE_LINES && (
            <Text>
              <Text>{"     "}</Text>
              <Text color={dim}>{`\u2026 (+${outputLines.length - MAX_SINGLE_LINES} lines)`}</Text>
            </Text>
          )}
        </Box>
      ) : r.success ? (
        /* Short summary */
        <Text>
          <Text color={dim}>{"  \u23BF  "}</Text>
          <Text>{getShortSummary(r)}</Text>
        </Text>
      ) : (
        /* Error */
        <Box flexDirection="column">
          <Text>
            <Text color={dim}>{"  \u23BF  "}</Text>
            <Text color={error}>{outputLines[0] || "Failed"}</Text>
          </Text>
          {outputLines.slice(1, 5).map((line, i) => (
            <Text key={i}>
              <Text>{"     "}</Text>
              <Text color={error}>{line}</Text>
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Main ToolGroup Component ────────────────────────────
export function ToolGroup({ results, duration, tokenCount, expanded, label, toolUseCount }: ToolGroupProps) {
  const { primary, dim, info, error } = useTheme();

  const durationStr = duration >= 60000
    ? `${Math.floor(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`
    : `${(duration / 1000).toFixed(1)}s`;

  const tokenStr = tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : String(tokenCount);

  // ── For 1-2 tools: show each individually (like Claude Code) ──
  if (results.length <= 2 && expanded) {
    return (
      <Box flexDirection="column">
        {results.map((r, i) => (
          <SingleToolView key={i} r={r} />
        ))}
      </Box>
    );
  }

  // ── Collapsed group view ──
  if (!expanded) {
    return (
      <Box flexDirection="column" marginLeft={2}>
        <Text>
          <Text color={info} bold>{"⏺ "}</Text>
          <Text bold>{toolUseCount} tool use{toolUseCount !== 1 ? "s" : ""}</Text>
          {label && <Text color={dim}> \u2014 {label}</Text>}
          <Text color={dim}> (ctrl+o to expand)</Text>
        </Text>
      </Box>
    );
  }

  // ── Expanded tree view (3+ tools) ──
  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* Header */}
      <Text>
        <Text color={info} bold>{"⏺ "}</Text>
        <Text bold>{toolUseCount} tool use{toolUseCount !== 1 ? "s" : ""}</Text>
        {label && <Text color={dim}> \u2014 {label}</Text>}
      </Text>

      {/* Tree items */}
      {results.map((r, i) => {
        const isLast = i === results.length - 1;
        const prefix = isLast ? "\u2514\u2500" : "\u251C\u2500";
        const continuePrefix = isLast ? "   " : "\u2502  ";
        const toolLabel = TOOL_LABELS[r.tool] || r.tool;
        const toolColor = r.success ? (TOOL_COLORS[r.tool] || primary) : error;
        const arg = getToolArg(r.tool, r.filePath, r.command);
        const summary = getShortSummary(r);
        const hasDiff = r.tool === "edit" && r.diff && r.diff.oldStr && r.diff.newStr;
        const isFullOutput = FULL_OUTPUT_TOOLS.has(r.tool);
        const outputLines = r.result.split("\n").filter(l => l.trim());

        return (
          <Box key={i} flexDirection="column">
            {/* Tool header: ├─ Read(file) · 42 lines */}
            <Text>
              <Text color={dim}>{"   "}{prefix} </Text>
              <Text color={toolColor} bold>{toolLabel}</Text>
              {arg && <Text color={dim}>({arg})</Text>}
              <Text color={dim}> \u00B7 {summary}</Text>
            </Text>

            {/* Diff view for edit tools */}
            {hasDiff ? (
              <Box marginLeft={3} flexDirection="column">
                <Text color={dim}>{"   "}{continuePrefix}</Text>
                <Box marginLeft={3}>
                  <ClaudeCodeDiff
                    oldStr={r.diff!.oldStr}
                    newStr={r.diff!.newStr}
                    startLineNumber={r.startLineNumber || 1}
                    maxLines={20}
                  />
                </Box>
              </Box>
            ) : r.success && isFullOutput && outputLines.length > 0 ? (
              /* Multi-line output for bash/grep etc */
              <Box flexDirection="column">
                {outputLines.slice(0, MAX_EXPANDED_LINES).map((line, li) => (
                  <Text key={li}>
                    <Text color={dim}>{"   "}{continuePrefix}  </Text>
                    <Text>{line}</Text>
                  </Text>
                ))}
                {outputLines.length > MAX_EXPANDED_LINES && (
                  <Text>
                    <Text color={dim}>{"   "}{continuePrefix}  \u2026 (+{outputLines.length - MAX_EXPANDED_LINES} lines)</Text>
                  </Text>
                )}
              </Box>
            ) : !r.success ? (
              /* Error output */
              <Box flexDirection="column">
                <Text>
                  <Text color={dim}>{"   "}{continuePrefix}\u23BF  </Text>
                  <Text color={error}>{outputLines[0] || "Failed"}</Text>
                </Text>
                {outputLines.slice(1, 4).map((line, li) => (
                  <Text key={li}>
                    <Text color={dim}>{"   "}{continuePrefix}   </Text>
                    <Text color={error}>{line}</Text>
                  </Text>
                ))}
              </Box>
            ) : null}
          </Box>
        );
      })}

      {/* Footer with stats */}
      <Text color={dim}>
        {"   "}({durationStr} \u00B7 \u2193 {tokenStr} tokens)
      </Text>
    </Box>
  );
}
