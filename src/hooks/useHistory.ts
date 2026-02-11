import { useState, useCallback } from "react";

const MAX_HISTORY = 100;

export function useCommandHistory() {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [savedInput, setSavedInput] = useState("");

  const addToHistory = useCallback((cmd: string) => {
    if (!cmd.trim()) return;
    setHistory((prev) => {
      if (prev.length > 0 && prev[0] === cmd) return prev;
      const next = [cmd, ...prev];
      if (next.length > MAX_HISTORY) next.pop();
      return next;
    });
    setHistoryIdx(-1);
    setSavedInput("");
  }, []);

  const navigateUp = useCallback((currentInput: string): string | null => {
    if (history.length === 0) return null;
    const newIdx = historyIdx === -1 ? 0 : Math.min(historyIdx + 1, history.length - 1);
    if (newIdx === historyIdx && historyIdx !== -1) return null;
    if (historyIdx === -1) setSavedInput(currentInput);
    setHistoryIdx(newIdx);
    return history[newIdx];
  }, [history, historyIdx]);

  const navigateDown = useCallback((): string | null => {
    if (historyIdx < 0) return null;
    const newIdx = historyIdx - 1;
    setHistoryIdx(newIdx);
    if (newIdx < 0) return savedInput;
    return history[newIdx];
  }, [history, historyIdx, savedInput]);

  const resetNavigation = useCallback(() => {
    setHistoryIdx(-1);
    setSavedInput("");
  }, []);

  return { history, addToHistory, navigateUp, navigateDown, resetNavigation };
}
