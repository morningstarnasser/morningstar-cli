import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
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
}

export function Input({ onSubmit, activeAgent, planMode, thinkMode, isProcessing, suggestions }: InputProps) {
  const { prompt, accent, warning, dim } = useTheme();
  const theme = getTheme();
  const [value, setValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggIdx, setSelectedSuggIdx] = useState(0);
  const { addToHistory, navigateUp, navigateDown, resetNavigation } = useCommandHistory();

  // Compute prompt text
  let promptText = "> ";
  let promptColor = prompt;
  if (activeAgent) {
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

  // Filter suggestions
  const filteredSuggestions = value.startsWith("/")
    ? suggestions.filter((s) => s.cmd.startsWith(value)).slice(0, 8)
    : [];

  useInput((input, key) => {
    if (isProcessing) return;

    if (key.return) {
      if (showSuggestions && filteredSuggestions.length > 0 && filteredSuggestions[selectedSuggIdx]?.cmd !== value) {
        // Accept suggestion on Enter if suggestion list is open and selected != current
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

  if (isProcessing) return null;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={promptColor} bold>{promptText}</Text>
        <Text>{value}</Text>
        <Text color={dim}>█</Text>
      </Box>
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
    </Box>
  );
}
