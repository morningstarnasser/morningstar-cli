import { useState, useCallback } from "react";

export type VimMode = "normal" | "insert";

interface VimState {
  mode: VimMode;
  cursorPos: number;
  value: string;
}

interface UseVimInputReturn {
  mode: VimMode;
  value: string;
  cursorPos: number;
  handleInput: (input: string, key: any) => { handled: boolean; submit?: string };
  setValue: (v: string) => void;
  reset: () => void;
}

export function useVimInput(): UseVimInputReturn {
  const [state, setState] = useState<VimState>({
    mode: "normal",
    cursorPos: 0,
    value: "",
  });

  const setValue = useCallback((v: string) => {
    setState(prev => ({ ...prev, value: v, cursorPos: Math.min(prev.cursorPos, v.length) }));
  }, []);

  const reset = useCallback(() => {
    setState({ mode: "normal", cursorPos: 0, value: "" });
  }, []);

  const handleInput = useCallback((input: string, key: any): { handled: boolean; submit?: string } => {
    if (state.mode === "normal") {
      return handleNormalMode(input, key);
    }
    return handleInsertMode(input, key);
  }, [state]);

  function handleNormalMode(input: string, key: any): { handled: boolean; submit?: string } {
    switch (input) {
      case "i":
        setState(prev => ({ ...prev, mode: "insert" }));
        return { handled: true };
      case "a":
        setState(prev => ({
          ...prev,
          mode: "insert",
          cursorPos: Math.min(prev.cursorPos + 1, prev.value.length),
        }));
        return { handled: true };
      case "A":
        setState(prev => ({
          ...prev,
          mode: "insert",
          cursorPos: prev.value.length,
        }));
        return { handled: true };
      case "I":
        setState(prev => ({ ...prev, mode: "insert", cursorPos: 0 }));
        return { handled: true };
      case "h":
        setState(prev => ({ ...prev, cursorPos: Math.max(0, prev.cursorPos - 1) }));
        return { handled: true };
      case "l":
        setState(prev => ({ ...prev, cursorPos: Math.min(prev.value.length - 1, prev.cursorPos + 1) }));
        return { handled: true };
      case "0":
        setState(prev => ({ ...prev, cursorPos: 0 }));
        return { handled: true };
      case "$":
        setState(prev => ({ ...prev, cursorPos: Math.max(0, prev.value.length - 1) }));
        return { handled: true };
      case "w": {
        setState(prev => {
          const rest = prev.value.slice(prev.cursorPos);
          const match = rest.match(/^\S*\s+/);
          const jump = match ? match[0].length : rest.length;
          return { ...prev, cursorPos: Math.min(prev.value.length - 1, prev.cursorPos + jump) };
        });
        return { handled: true };
      }
      case "b": {
        setState(prev => {
          const before = prev.value.slice(0, prev.cursorPos);
          const match = before.match(/\s+\S*$/);
          const jump = match ? match[0].length : before.length;
          return { ...prev, cursorPos: Math.max(0, prev.cursorPos - jump) };
        });
        return { handled: true };
      }
      case "x":
        setState(prev => {
          const newVal = prev.value.slice(0, prev.cursorPos) + prev.value.slice(prev.cursorPos + 1);
          return { ...prev, value: newVal, cursorPos: Math.min(prev.cursorPos, Math.max(0, newVal.length - 1)) };
        });
        return { handled: true };
      case "d":
        // dd clears line (simplified — just clear on single d)
        setState(prev => ({ ...prev, value: "", cursorPos: 0 }));
        return { handled: true };
      case "c":
        setState(prev => ({ ...prev, value: "", cursorPos: 0, mode: "insert" }));
        return { handled: true };
      default:
        if (key.return && state.value.trim()) {
          const submit = state.value.trim();
          setState({ mode: "normal", cursorPos: 0, value: "" });
          return { handled: true, submit };
        }
        return { handled: false };
    }
  }

  function handleInsertMode(input: string, key: any): { handled: boolean; submit?: string } {
    if (key.escape) {
      setState(prev => ({
        ...prev,
        mode: "normal",
        cursorPos: Math.max(0, prev.cursorPos - 1),
      }));
      return { handled: true };
    }

    if (key.return && state.value.trim()) {
      const submit = state.value.trim();
      setState({ mode: "normal", cursorPos: 0, value: "" });
      return { handled: true, submit };
    }

    if (key.backspace || key.delete) {
      setState(prev => {
        if (prev.cursorPos === 0) return prev;
        const newVal = prev.value.slice(0, prev.cursorPos - 1) + prev.value.slice(prev.cursorPos);
        return { ...prev, value: newVal, cursorPos: prev.cursorPos - 1 };
      });
      return { handled: true };
    }

    if (input && !key.ctrl && !key.meta) {
      setState(prev => {
        const newVal = prev.value.slice(0, prev.cursorPos) + input + prev.value.slice(prev.cursorPos);
        return { ...prev, value: newVal, cursorPos: prev.cursorPos + input.length };
      });
      return { handled: true };
    }

    return { handled: false };
  }

  return {
    mode: state.mode,
    value: state.value,
    cursorPos: state.cursorPos,
    handleInput,
    setValue,
    reset,
  };
}
