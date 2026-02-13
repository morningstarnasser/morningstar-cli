// ─── Streaming Diff ──────────────────────────────────────
// Shows real-time diff preview as the AI generates edit
// operations. Parses partial tool call output and renders
// incremental diff hunks.

import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

// ─── Types ───────────────────────────────────────────────

export interface StreamingDiffState {
  /** The file being edited */
  filePath: string | null;
  /** Original file content (lines) */
  originalLines: string[];
  /** The old_string being searched for */
  oldString: string;
  /** The new_string being typed in */
  newString: string;
  /** Whether we're currently inside an edit tool call */
  active: boolean;
  /** Which part we're capturing: filePath, oldString, newString */
  phase: "idle" | "filePath" | "oldString" | "newString" | "complete";
  /** The computed diff lines so far */
  diffLines: DiffLine[];
  /** Start line number in the original file */
  startLine: number;
}

export interface DiffLine {
  type: "context" | "removed" | "added" | "header";
  lineNumber?: number;
  content: string;
}

// ─── State Management ────────────────────────────────────

/**
 * Create a new streaming diff state.
 */
export function createStreamingDiffState(): StreamingDiffState {
  return {
    filePath: null,
    originalLines: [],
    oldString: "",
    newString: "",
    active: false,
    phase: "idle",
    diffLines: [],
    startLine: 0,
  };
}

/**
 * Detect if the streaming text contains an edit/write tool call starting.
 * Returns the extracted fields so far from a partial tool call.
 */
export function parsePartialEditCall(text: string): {
  detected: boolean;
  filePath?: string;
  oldString?: string;
  newString?: string;
  isComplete: boolean;
} {
  // Match edit tool call pattern: [tool:edit] or {"tool":"edit",...}
  // Pattern 1: XML-like tool calls
  const editMatch = text.match(/\[tool:edit\]\s*\n/);
  if (editMatch) {
    const afterTool = text.slice(editMatch.index! + editMatch[0].length);
    return parseEditArgs(afterTool);
  }

  // Pattern 2: JSON-like tool calls (native function calling)
  const jsonMatch = text.match(/"name"\s*:\s*"edit"/);
  if (jsonMatch) {
    return parseJsonEditArgs(text);
  }

  // Pattern 3: Simple line-based: EDIT filePath\nOLD:\n...\nNEW:\n...
  const simpleMatch = text.match(/EDIT\s+(\S+)/);
  if (simpleMatch) {
    return parseSimpleEditArgs(text, simpleMatch[1]);
  }

  return { detected: false, isComplete: false };
}

function parseEditArgs(text: string): {
  detected: boolean;
  filePath?: string;
  oldString?: string;
  newString?: string;
  isComplete: boolean;
} {
  const fileMatch = text.match(/filePath:\s*(.+?)(?:\n|$)/);
  const oldMatch = text.match(/oldString:\s*```[\s\S]*?\n([\s\S]*?)```/);
  const newMatch = text.match(/newString:\s*```[\s\S]*?\n([\s\S]*?)```/);

  return {
    detected: true,
    filePath: fileMatch?.[1]?.trim(),
    oldString: oldMatch?.[1],
    newString: newMatch?.[1],
    isComplete: !!(fileMatch && oldMatch && newMatch),
  };
}

function parseJsonEditArgs(text: string): {
  detected: boolean;
  filePath?: string;
  oldString?: string;
  newString?: string;
  isComplete: boolean;
} {
  const fpMatch = text.match(/"filePath"\s*:\s*"([^"]+)"/);
  const oldMatch = text.match(/"oldString"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const newMatch = text.match(/"newString"\s*:\s*"((?:[^"\\]|\\.)*)"/);

  return {
    detected: true,
    filePath: fpMatch?.[1],
    oldString: oldMatch?.[1]?.replace(/\\n/g, "\n").replace(/\\"/g, '"'),
    newString: newMatch?.[1]?.replace(/\\n/g, "\n").replace(/\\"/g, '"'),
    isComplete: !!(fpMatch && oldMatch && newMatch),
  };
}

function parseSimpleEditArgs(text: string, filePath: string): {
  detected: boolean;
  filePath?: string;
  oldString?: string;
  newString?: string;
  isComplete: boolean;
} {
  const oldMatch = text.match(/OLD:\n([\s\S]*?)(?:NEW:|$)/);
  const newMatch = text.match(/NEW:\n([\s\S]*?)(?:$)/);

  return {
    detected: true,
    filePath,
    oldString: oldMatch?.[1]?.trimEnd(),
    newString: newMatch?.[1]?.trimEnd(),
    isComplete: !!(oldMatch && newMatch && newMatch[1].length > 0),
  };
}

/**
 * Update the streaming diff state with new streamed text.
 * Returns updated state with computed diff lines.
 */
export function updateStreamingDiff(
  state: StreamingDiffState,
  streamedText: string,
  cwd: string,
): StreamingDiffState {
  const parsed = parsePartialEditCall(streamedText);

  if (!parsed.detected) {
    return { ...state, active: false, phase: "idle" };
  }

  const newState = { ...state, active: true };

  // Update file path
  if (parsed.filePath && parsed.filePath !== state.filePath) {
    newState.filePath = parsed.filePath;
    // Load original file
    const fullPath = parsed.filePath.startsWith("/") ? parsed.filePath : `${cwd}/${parsed.filePath}`;
    try {
      if (existsSync(fullPath)) {
        newState.originalLines = readFileSync(fullPath, "utf-8").split("\n");
      }
    } catch {
      newState.originalLines = [];
    }
    newState.phase = "filePath";
  }

  // Update old string
  if (parsed.oldString !== undefined) {
    newState.oldString = parsed.oldString;
    newState.phase = "oldString";

    // Find the location in the original file
    if (newState.originalLines.length > 0) {
      const oldLines = parsed.oldString.split("\n");
      const startIdx = findSubsequence(newState.originalLines, oldLines);
      newState.startLine = startIdx >= 0 ? startIdx + 1 : 0;
    }
  }

  // Update new string and compute diff
  if (parsed.newString !== undefined) {
    newState.newString = parsed.newString;
    newState.phase = parsed.isComplete ? "complete" : "newString";

    // Compute the diff
    newState.diffLines = computeStreamingDiff(
      newState.oldString,
      newState.newString,
      newState.startLine,
      newState.filePath || "",
    );
  }

  return newState;
}

/**
 * Find the starting index of a subsequence of lines in the original.
 */
function findSubsequence(original: string[], search: string[]): number {
  if (search.length === 0) return -1;
  const firstLine = search[0].trim();

  for (let i = 0; i <= original.length - search.length; i++) {
    if (original[i].trim() === firstLine) {
      let match = true;
      for (let j = 1; j < search.length; j++) {
        if (original[i + j]?.trim() !== search[j]?.trim()) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
  }
  return -1;
}

/**
 * Compute diff lines from old and new strings.
 */
export function computeStreamingDiff(
  oldStr: string,
  newStr: string,
  startLine: number,
  filePath: string,
): DiffLine[] {
  const lines: DiffLine[] = [];
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // Header
  lines.push({
    type: "header",
    content: `--- ${filePath}`,
  });

  // Simple line-by-line diff
  const maxLen = Math.max(oldLines.length, newLines.length);
  let lineNum = startLine;

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      // Context line
      lines.push({
        type: "context",
        lineNumber: lineNum,
        content: oldLine ?? "",
      });
    } else {
      if (oldLine !== undefined) {
        lines.push({
          type: "removed",
          lineNumber: lineNum,
          content: oldLine,
        });
      }
      if (newLine !== undefined) {
        lines.push({
          type: "added",
          lineNumber: lineNum,
          content: newLine,
        });
      }
    }
    lineNum++;
  }

  return lines;
}

/**
 * Format streaming diff lines for terminal display.
 */
export function formatStreamingDiff(state: StreamingDiffState): string {
  if (!state.active || state.diffLines.length === 0) return "";

  const lines: string[] = [];

  if (state.filePath) {
    lines.push(`  \u23FA Streaming Edit: ${state.filePath}`);
  }

  for (const dl of state.diffLines) {
    const ln = dl.lineNumber ? String(dl.lineNumber).padStart(4) + " \u2502 " : "     \u2502 ";

    switch (dl.type) {
      case "header":
        lines.push(`  ${dl.content}`);
        break;
      case "context":
        lines.push(`  ${ln}  ${dl.content}`);
        break;
      case "removed":
        lines.push(`  ${ln}- ${dl.content}`);
        break;
      case "added":
        lines.push(`  ${ln}+ ${dl.content}`);
        break;
    }
  }

  if (state.phase !== "complete") {
    lines.push("  ... (streaming)");
  }

  return lines.join("\n");
}

/**
 * Check if the streamed text appears to contain an edit operation.
 */
export function hasEditOperation(text: string): boolean {
  return /\[tool:edit\]|"name"\s*:\s*"edit"|EDIT\s+\S+/.test(text);
}
