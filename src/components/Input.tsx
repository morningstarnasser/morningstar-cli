import React, { useState, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { useTheme } from "../hooks/useTheme.js";
import { useCommandHistory } from "../hooks/useHistory.js";
import { getTheme } from "../theme.js";
import { getAllAgents } from "../custom-agents.js";

interface InputProps {
  onSubmit: (value: string) => void;
  activeAgent: string | null;
  planMode: boolean;
  thinkMode: boolean;
  isProcessing: boolean;
  suggestions: Array<{ cmd: string; desc: string }>;
  vimMode?: boolean;
  cwd?: string;
}

// Get file/directory completions for a partial path
function getFileCompletions(partial: string, cwd: string, maxResults = 8): string[] {
  try {
    const isAbsolute = partial.startsWith("/");
    const basePath = isAbsolute ? partial : join(cwd, partial);
    const dir = partial.endsWith("/") ? basePath : dirname(basePath);
    const prefix = partial.endsWith("/") ? "" : basename(partial).toLowerCase();

    const entries = readdirSync(dir).filter(e => !e.startsWith("."));
    const matches: string[] = [];

    for (const entry of entries) {
      if (prefix && !entry.toLowerCase().startsWith(prefix)) continue;
      const fullPath = join(dir, entry);
      const isDir = (() => { try { return statSync(fullPath).isDirectory(); } catch { return false; } })();
      // Return relative path from cwd
      const relDir = isAbsolute ? dir : dir.replace(cwd + "/", "").replace(cwd, "");
      const rel = relDir ? `${relDir}/${entry}` : entry;
      matches.push(isDir ? rel + "/" : rel);
      if (matches.length >= maxResults) break;
    }
    return matches;
  } catch {
    return [];
  }
}

export function Input({ onSubmit, activeAgent, planMode, thinkMode, isProcessing, suggestions, vimMode, cwd }: InputProps) {
  const { prompt, accent, warning, dim } = useTheme();
  const theme = getTheme();
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggIdx, setSelectedSuggIdx] = useState(0);
  const { addToHistory, navigateUp, navigateDown, resetNavigation } = useCommandHistory();

  // Helper: update value AND put cursor at the end (used for history nav, completions, clear)
  function setValueEnd(next: string): void {
    setValue(next);
    setCursorPos(next.length);
  }

  // Queued message — typed while AI is processing
  const [queued, setQueued] = useState<string | null>(null);
  const queuedRef = useRef<string | null>(null);

  // Vim mode state
  const [vimModeState, setVimModeState] = useState<"normal" | "insert">("normal");

  // When processing finishes and there's a queued message, auto-submit it
  useEffect(() => {
    if (!isProcessing && queuedRef.current) {
      const msg = queuedRef.current;
      queuedRef.current = null;
      setQueued(null);
      setValue("");
      // Small delay to let UI settle
      setTimeout(() => onSubmit(msg), 50);
    }
  }, [isProcessing, onSubmit]);

  // Compute prompt text
  let promptText = "> ";
  let promptColor = prompt;
  if (vimMode) {
    promptText = vimModeState === "normal" ? "[NORMAL] > " : "[INSERT] > ";
    promptColor = vimModeState === "normal" ? accent : prompt;
  } else if (activeAgent) {
    const allAgents = getAllAgents();
    const agent = allAgents[activeAgent];
    if (agent) {
      promptText = `[${agent.name}] > `;
      promptColor = agent.color;
    }
  } else if (planMode) {
    promptText = "[Plan] > ";
    promptColor = warning;
  } else if (thinkMode) {
    promptText = "[Think] > ";
    promptColor = accent;
  }

  // Filter suggestions (only when not processing)
  const filteredSuggestions = !isProcessing && value.startsWith("/")
    ? suggestions.filter((s) => s.cmd.toLowerCase().startsWith(value.toLowerCase())).slice(0, 50)
    : [];

  // @file mention completions
  const [fileCompletions, setFileCompletions] = useState<string[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const showFileSuggestions = fileCompletions.length > 0 && !showSuggestions;

  // Update file completions when value contains @
  useEffect(() => {
    if (!cwd || isProcessing) { setFileCompletions([]); return; }
    const atIdx = value.lastIndexOf("@");
    if (atIdx >= 0 && atIdx < value.length) {
      const partial = value.slice(atIdx + 1);
      // Only trigger if there's no space after @
      if (!partial.includes(" ") && partial.length > 0) {
        const completions = getFileCompletions(partial, cwd);
        setFileCompletions(completions);
        setSelectedFileIdx(0);
      } else {
        setFileCompletions([]);
      }
    } else {
      setFileCompletions([]);
    }
  }, [value, cwd, isProcessing]);

  useInput((input, key) => {
    // ── While processing: allow typing + queue on Enter ──
    if (isProcessing) {
      // Readline-style editing shortcuts still available in processing mode
      if (key.ctrl && input === "a") { setCursorPos(0); return; }
      if (key.ctrl && input === "e") { setCursorPos(value.length); return; }
      if (key.ctrl) return;

      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) {
          addToHistory(trimmed);
          queuedRef.current = trimmed;
          setQueued(trimmed);
          setValueEnd("");
        }
        return;
      }

      if (key.escape) {
        if (queuedRef.current) {
          queuedRef.current = null;
          setQueued(null);
        }
        setValueEnd("");
        return;
      }

      if (key.leftArrow) { setCursorPos((p) => Math.max(0, p - 1)); return; }
      if (key.rightArrow) { setCursorPos((p) => Math.min(value.length, p + 1)); return; }

      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          setValue(value.slice(0, cursorPos - 1) + value.slice(cursorPos));
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setValue(value.slice(0, cursorPos) + input + value.slice(cursorPos));
        setCursorPos(cursorPos + input.length);
      }
      return;
    }

    // ── Normal mode (not processing) ──

    // Vim mode key handling
    if (vimMode && vimModeState === "normal") {
      if (input === "i") { setVimModeState("insert"); return; }
      if (input === "a") { setCursorPos(Math.min(value.length, cursorPos + 1)); setVimModeState("insert"); return; }
      if (input === "A") { setCursorPos(value.length); setVimModeState("insert"); return; }
      if (input === "I") { setCursorPos(0); setVimModeState("insert"); return; }
      if (input === "h" || key.leftArrow) { setCursorPos((p) => Math.max(0, p - 1)); return; }
      if (input === "l" || key.rightArrow) { setCursorPos((p) => Math.min(value.length, p + 1)); return; }
      if (input === "0") { setCursorPos(0); return; }
      if (input === "$") { setCursorPos(value.length); return; }
      if (input === "d") { setValueEnd(""); return; }
      if (input === "c") { setValueEnd(""); setVimModeState("insert"); return; }
      if (key.return && value.trim()) {
        addToHistory(value.trim());
        onSubmit(value.trim());
        setValueEnd("");
        setShowSuggestions(false);
        setSelectedSuggIdx(0);
        resetNavigation();
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.return) return;
    }
    if (vimMode && vimModeState === "insert" && key.escape) {
      setVimModeState("normal");
      return;
    }

    if (key.return) {
      if (showSuggestions && filteredSuggestions.length > 0 && filteredSuggestions[selectedSuggIdx]?.cmd !== value) {
        setValueEnd(filteredSuggestions[selectedSuggIdx].cmd);
        setShowSuggestions(false);
        setSelectedSuggIdx(0);
        return;
      }
      const trimmed = value.trim();
      if (trimmed) {
        addToHistory(trimmed);
        onSubmit(trimmed);
      }
      setValueEnd("");
      setShowSuggestions(false);
      setSelectedSuggIdx(0);
      resetNavigation();
      return;
    }

    if (key.escape) {
      setShowSuggestions(false);
      setSelectedSuggIdx(0);
      return;
    }

    // ── Cursor navigation ──
    if (key.leftArrow) {
      if (showSuggestions && filteredSuggestions.length > 0) {
        // Left on suggestion list: dismiss
        setShowSuggestions(false);
        setSelectedSuggIdx(0);
        return;
      }
      setCursorPos((p) => Math.max(0, p - 1));
      return;
    }

    if (key.rightArrow) {
      if (showSuggestions && filteredSuggestions.length > 0) {
        setValueEnd(filteredSuggestions[selectedSuggIdx].cmd);
        setShowSuggestions(false);
        setSelectedSuggIdx(0);
        return;
      }
      // If cursor at end, completion hint accept (future); else move right
      setCursorPos((p) => Math.min(value.length, p + 1));
      return;
    }

    // ── Readline-style shortcuts: Ctrl+A (home), Ctrl+E (end), Ctrl+U (clear), Ctrl+W (delete word) ──
    if (key.ctrl && input === "a") { setCursorPos(0); return; }
    if (key.ctrl && input === "e") { setCursorPos(value.length); return; }
    if (key.ctrl && input === "u") { setValueEnd(""); setShowSuggestions(false); return; }
    if (key.ctrl && input === "k") {
      setValue(value.slice(0, cursorPos));
      return;
    }
    if (key.ctrl && input === "w") {
      if (cursorPos === 0) return;
      // Delete previous word: skip trailing spaces, then the word itself
      const left = value.slice(0, cursorPos);
      const right = value.slice(cursorPos);
      const trimmedLeft = left.replace(/\s+$/, "");
      const wordStart = trimmedLeft.search(/\S+$/);
      const cutAt = wordStart >= 0 ? wordStart : 0;
      setValue(left.slice(0, cutAt) + right);
      setCursorPos(cutAt);
      return;
    }

    if (key.upArrow) {
      if (showSuggestions && filteredSuggestions.length > 0) {
        setSelectedSuggIdx(Math.max(0, selectedSuggIdx - 1));
      } else {
        const prev = navigateUp(value);
        if (prev !== null) setValueEnd(prev);
      }
      return;
    }

    if (key.downArrow) {
      if (showSuggestions && filteredSuggestions.length > 0) {
        setSelectedSuggIdx(Math.min(filteredSuggestions.length - 1, selectedSuggIdx + 1));
      } else {
        const next = navigateDown();
        if (next !== null) setValueEnd(next);
      }
      return;
    }

    if (key.tab && showFileSuggestions && fileCompletions.length > 0) {
      const atIdx = value.lastIndexOf("@");
      const before = value.slice(0, atIdx + 1);
      setValueEnd(before + fileCompletions[selectedFileIdx]);
      setFileCompletions([]);
      setSelectedFileIdx(0);
      return;
    }

    if (key.tab && showSuggestions && filteredSuggestions.length > 0) {
      setValueEnd(filteredSuggestions[selectedSuggIdx].cmd);
      setShowSuggestions(false);
      setSelectedSuggIdx(0);
      return;
    }

    if (key.backspace || key.delete) {
      // Backspace = delete char LEFT of cursor; Delete (fn+del) = delete char UNDER cursor
      if (key.delete && !key.backspace && cursorPos < value.length) {
        const newVal = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
        setValue(newVal);
        setShowSuggestions(newVal.startsWith("/") && newVal.length > 0);
        setSelectedSuggIdx(0);
        return;
      }
      if (cursorPos > 0) {
        const newVal = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        setValue(newVal);
        setCursorPos(cursorPos - 1);
        setShowSuggestions(newVal.startsWith("/") && newVal.length > 0);
        setSelectedSuggIdx(0);
      }
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const newVal = value.slice(0, cursorPos) + input + value.slice(cursorPos);
      setValue(newVal);
      setCursorPos(cursorPos + input.length);
      setShowSuggestions(newVal.startsWith("/"));
      setSelectedSuggIdx(0);
      resetNavigation();
    }
  });

  return (
    <Box flexDirection="column">
      {/* Queued message indicator */}
      {queued && isProcessing && (
        <Box marginLeft={2} marginBottom={0}>
          <Text color="#fbbf24">{"⏳ "}</Text>
          <Text color={dim}>Queued: </Text>
          <Text color="#fbbf24">{queued.length > 60 ? queued.slice(0, 57) + "..." : queued}</Text>
          <Text color={dim}> (Esc to cancel)</Text>
        </Box>
      )}

      {/* Input line — always visible. Cursor rendered at cursorPos. */}
      <Box>
        <Text color={isProcessing ? dim : promptColor} bold>{promptText}</Text>
        {(() => {
          const before = value.slice(0, cursorPos);
          const atCursor = cursorPos < value.length ? value[cursorPos] : "";
          const after = cursorPos < value.length ? value.slice(cursorPos + 1) : "";
          const textColor = isProcessing ? dim : undefined;
          return (
            <>
              <Text color={textColor}>{before}</Text>
              {atCursor ? (
                <Text inverse>{atCursor}</Text>
              ) : (
                <Text color={isProcessing ? "#4b5563" : dim}>█</Text>
              )}
              <Text color={textColor}>{after}</Text>
            </>
          );
        })()}
      </Box>

      {/* Autocomplete suggestions */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {filteredSuggestions.map((s, i) => (
            <Box key={s.cmd}>
              {i === selectedSuggIdx ? (
                <Text backgroundColor="#3b3b3b">
                  <Text color="#22d3ee" bold>  {s.cmd}</Text>
                  <Text color="#6b7280"> {s.desc}</Text>
                </Text>
              ) : (
                <Text>
                  <Text color="#6b7280">  {s.cmd}</Text>
                  <Text color="#4b5563"> {s.desc}</Text>
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* @file mention autocomplete */}
      {showFileSuggestions && (
        <Box flexDirection="column" marginLeft={2}>
          <Text color="#6b7280">  Dateien (Tab zum Vervollstaendigen):</Text>
          {fileCompletions.map((f, i) => (
            <Box key={f}>
              {i === selectedFileIdx ? (
                <Text backgroundColor="#3b3b3b">
                  <Text color="#34d399" bold>  {f}</Text>
                </Text>
              ) : (
                <Text color="#6b7280">  {f}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
