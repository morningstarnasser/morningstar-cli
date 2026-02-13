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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggIdx, setSelectedSuggIdx] = useState(0);
  const { addToHistory, navigateUp, navigateDown, resetNavigation } = useCommandHistory();

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
    ? suggestions.filter((s) => s.cmd.startsWith(value)).slice(0, 8)
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
      // ctrl+c is handled by app.tsx, not here
      if (key.ctrl) return;

      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) {
          addToHistory(trimmed);
          queuedRef.current = trimmed;
          setQueued(trimmed);
          setValue("");
        }
        return;
      }

      if (key.escape) {
        // Cancel queued message
        if (queuedRef.current) {
          queuedRef.current = null;
          setQueued(null);
        }
        setValue("");
        return;
      }

      if (key.backspace || key.delete) {
        setValue(prev => prev.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setValue(prev => prev + input);
      }
      return;
    }

    // ── Normal mode (not processing) ──

    // Vim mode key handling
    if (vimMode && vimModeState === "normal") {
      if (input === "i") { setVimModeState("insert"); return; }
      if (input === "a") { setVimModeState("insert"); return; }
      if (input === "A") { setValue(value); setVimModeState("insert"); return; }
      if (input === "I") { setVimModeState("insert"); return; }
      if (input === "d") { setValue(""); return; }
      if (input === "c") { setValue(""); setVimModeState("insert"); return; }
      if (key.return && value.trim()) {
        addToHistory(value.trim());
        onSubmit(value.trim());
        setValue("");
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
        setValue(filteredSuggestions[selectedSuggIdx].cmd);
        setShowSuggestions(false);
        setSelectedSuggIdx(0);
        return;
      }
      const trimmed = value.trim();
      if (trimmed) {
        addToHistory(trimmed);
        onSubmit(trimmed);
      }
      setValue("");
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

    if (key.upArrow) {
      if (showSuggestions && filteredSuggestions.length > 0) {
        setSelectedSuggIdx(Math.max(0, selectedSuggIdx - 1));
      } else {
        const prev = navigateUp(value);
        if (prev !== null) setValue(prev);
      }
      return;
    }

    if (key.downArrow) {
      if (showSuggestions && filteredSuggestions.length > 0) {
        setSelectedSuggIdx(Math.min(filteredSuggestions.length - 1, selectedSuggIdx + 1));
      } else {
        const next = navigateDown();
        if (next !== null) setValue(next);
      }
      return;
    }

    if (key.rightArrow && showSuggestions && filteredSuggestions.length > 0) {
      setValue(filteredSuggestions[selectedSuggIdx].cmd);
      setShowSuggestions(false);
      setSelectedSuggIdx(0);
      return;
    }

    if (key.tab && showFileSuggestions && fileCompletions.length > 0) {
      // Complete @file mention
      const atIdx = value.lastIndexOf("@");
      const before = value.slice(0, atIdx + 1);
      setValue(before + fileCompletions[selectedFileIdx]);
      setFileCompletions([]);
      setSelectedFileIdx(0);
      return;
    }

    if (key.tab && showSuggestions && filteredSuggestions.length > 0) {
      setValue(filteredSuggestions[selectedSuggIdx].cmd);
      setShowSuggestions(false);
      setSelectedSuggIdx(0);
      return;
    }

    if (key.backspace || key.delete) {
      const newVal = value.slice(0, -1);
      setValue(newVal);
      setShowSuggestions(newVal.startsWith("/") && newVal.length > 0);
      setSelectedSuggIdx(0);
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const newVal = value + input;
      setValue(newVal);
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

      {/* Input line — always visible */}
      <Box>
        {isProcessing ? (
          <>
            <Text color={dim} bold>{promptText}</Text>
            <Text color={dim}>{value}</Text>
            <Text color="#4b5563">█</Text>
          </>
        ) : (
          <>
            <Text color={promptColor} bold>{promptText}</Text>
            <Text>{value}</Text>
            <Text color={dim}>█</Text>
          </>
        )}
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
