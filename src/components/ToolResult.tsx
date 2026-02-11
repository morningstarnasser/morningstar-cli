import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { AnimatedDiff } from "./AnimatedDiff.js";

interface ToolResultProps {
  tool: string;
  result: string;
  success: boolean;
  diff?: { filePath: string; oldStr: string; newStr: string };
  filePath?: string;
  linesChanged?: number;
  command?: string;
}

// Tool display names — Claude Code style
const TOOL_LABELS: Record<string, string> = {
  read: "Read",
  write: "Write",
  edit: "Update",
  delete: "Delete",
  bash: "Bash",
  "auto-bash": "Bash",
  "auto-python": "Python",
  grep: "Search",
  glob: "Glob",
  ls: "List",
  git: "Git",
  web: "WebSearch",
  fetch: "Fetch",
  gh: "GitHub",
  create: "Create",
  mkdir: "Create",
};

// Tool icons for each type
const TOOL_COLORS: Record<string, string> = {
  read: "#60a5fa",    // blue
  write: "#34d399",   // green
  edit: "#fbbf24",    // amber
  delete: "#f87171",  // red
  bash: "#a78bfa",    // purple
  grep: "#38bdf8",    // sky
  glob: "#38bdf8",    // sky
  ls: "#94a3b8",      // slate
  git: "#fb923c",     // orange
  web: "#2dd4bf",     // teal
  fetch: "#2dd4bf",   // teal
  gh: "#e879f9",      // fuchsia
};

function getToolArg(tool: string, filePath?: string, command?: string, result?: string): string {
  if (filePath) return filePath;
  if (command) {
    // Truncate long commands
    const short = command.length > 50 ? command.slice(0, 47) + "..." : command;
    return short;
  }
  // Try to extract path/query from result
  if (tool === "grep" || tool === "web") {
    const first = result?.split("\n")[0]?.slice(0, 40) || "";
    return first;
  }
  return "";
}

function getSummary(tool: string, result: string, success: boolean, linesChanged?: number, filePath?: string): string {
  if (!success) {
    // Extract meaningful error
    const msg = result.split("\n")[0]?.replace(/^(Fehler|Error):\s*/i, "") || "Failed";
    return msg.length > 80 ? msg.slice(0, 77) + "..." : msg;
  }

  switch (tool) {
    case "read":
      return `${linesChanged || "?"} lines`;
    case "write":
      return `Wrote ${linesChanged || "?"} lines`;
    case "edit": {
      return `Updated${linesChanged ? ` ${linesChanged} lines` : ""}`;
    }
    case "delete":
      return `Deleted`;
    case "bash":
    case "auto-bash":
    case "auto-python": {
      const lines = result.split("\n").filter(l => l.trim());
      if (lines.length === 0) return "(no output)";
      if (lines.length === 1) return lines[0].length > 80 ? lines[0].slice(0, 77) + "..." : lines[0];
      return `${lines[0].slice(0, 60)}${lines.length > 1 ? ` (+${lines.length - 1} lines)` : ""}`;
    }
    case "grep": {
      const matches = result.split("\n").filter(l => l.trim()).length;
      return matches === 0 ? "No matches" : `${matches} matches`;
    }
    case "glob": {
      const files = result.split("\n").filter(l => l.trim()).length;
      return files === 0 ? "No files found" : `${files} files`;
    }
    case "ls": {
      const entries = result.split("\n").filter(l => l.trim()).length;
      return `${entries} entries`;
    }
    case "git":
    case "gh":
    case "web":
    case "fetch": {
      const first = result.split("\n")[0]?.slice(0, 70) || "";
      return first;
    }
    default:
      return result.split("\n")[0]?.slice(0, 70) || "";
  }
}

// Tools that show full multi-line output (like Claude Code)
const FULL_OUTPUT_TOOLS = new Set(["bash", "auto-bash", "auto-python", "grep", "glob", "ls", "git", "web", "fetch"]);
const MAX_OUTPUT_LINES = 25;
const MAX_DIFF_LINES = 15;

export function ToolResult({ tool, result, success, diff, filePath, linesChanged, command }: ToolResultProps) {
  const { primary, error, dim } = useTheme();

  const label = TOOL_LABELS[tool] || tool;
  const toolColor = success ? (TOOL_COLORS[tool] || primary) : error;
  const arg = getToolArg(tool, filePath, command, result);
  const showFullOutput = FULL_OUTPUT_TOOLS.has(tool);
  const lines = result.split("\n");

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* Header: ⏺ ToolName(arg) */}
      <Text>
        <Text color={toolColor} bold>{"⏺ "}</Text>
        <Text color={toolColor} bold>{label}</Text>
        {arg && <Text color={dim}>({arg})</Text>}
      </Text>

      {/* Output with ⎿ continuation — Claude Code style */}
      {success && showFullOutput && lines.length > 0 ? (
        <Box flexDirection="column">
          {/* First line with ⎿ */}
          <Text>
            <Text color={dim}>{"  ⎿  "}</Text>
            <Text>{lines[0]}</Text>
          </Text>
          {/* Remaining lines indented to align */}
          {lines.slice(1, MAX_OUTPUT_LINES).map((line, i) => (
            <Text key={i}>
              <Text>{"     "}</Text>
              <Text>{line || " "}</Text>
            </Text>
          ))}
          {lines.length > MAX_OUTPUT_LINES && (
            <Text>
              <Text>{"     "}</Text>
              <Text color={dim}>{`… (+${lines.length - MAX_OUTPUT_LINES} lines)`}</Text>
            </Text>
          )}
        </Box>
      ) : success && !showFullOutput ? (
        /* Short summary for file tools (read/write/edit/delete) */
        <Text>
          <Text color={dim}>{"  ⎿  "}</Text>
          <Text>{getSummary(tool, result, success, linesChanged, filePath)}</Text>
        </Text>
      ) : !success ? (
        /* Error output */
        <Box flexDirection="column">
          <Text>
            <Text color={dim}>{"  ⎿  "}</Text>
            <Text color={error}>{lines[0]}</Text>
          </Text>
          {lines.slice(1, 10).map((line, i) => (
            <Text key={i}>
              <Text>{"     "}</Text>
              <Text color={error}>{line || " "}</Text>
            </Text>
          ))}
          {lines.length > 10 && (
            <Text>
              <Text>{"     "}</Text>
              <Text color={dim}>{`… (+${lines.length - 10} lines)`}</Text>
            </Text>
          )}
        </Box>
      ) : null}

      {/* Animated diff view for edit tool */}
      {diff && tool === "edit" && (
        <Box marginLeft={3}>
          <AnimatedDiff
            oldLines={diff.oldStr ? diff.oldStr.split("\n") : []}
            newLines={diff.newStr ? diff.newStr.split("\n") : []}
          />
        </Box>
      )}
    </Box>
  );
}
