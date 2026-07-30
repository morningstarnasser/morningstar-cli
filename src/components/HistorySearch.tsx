// ─── History Search Component (Ctrl+R) ──────────────────
// Interactive reverse search through input history

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { searchInputHistory } from "../input-history.js";

interface HistorySearchProps {
  onSelect: (value: string) => void;
  onCancel: () => void;
}

export function HistorySearch({ onSelect, onCancel }: HistorySearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const results = query ? searchInputHistory(query).slice(0, 8) : [];

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (results.length > 0) {
        onSelect(results[selectedIdx] || "");
      } else {
        onCancel();
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIdx(Math.max(0, selectedIdx - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIdx(Math.min(results.length - 1, selectedIdx + 1));
      return;
    }

    if (key.backspace || key.delete) {
      setQuery(prev => prev.slice(0, -1));
      setSelectedIdx(0);
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setQuery(prev => prev + input);
      setSelectedIdx(0);
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="#f59e0b" bold>{"(reverse-i-search)`"}</Text>
        <Text color="#22d3ee">{query}</Text>
        <Text color="#f59e0b" bold>{"': "}</Text>
        {results.length > 0 && <Text>{results[selectedIdx]}</Text>}
      </Box>

      {results.length > 1 && (
        <Box flexDirection="column" marginLeft={2}>
          {results.map((r, i) => (
            <Box key={i}>
              {i === selectedIdx ? (
                <Text backgroundColor="#3b3b3b" color="#22d3ee">{`  ${r}`}</Text>
              ) : (
                <Text color="#6b7280">{`  ${r}`}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
