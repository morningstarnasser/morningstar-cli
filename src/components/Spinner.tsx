import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";

const SPINNER_TEXTS = [
  "Generating", "Analyzing", "Thinking", "Processing",
  "Reasoning", "Evaluating", "Synthesizing", "Computing",
];

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface SpinnerProps {
  startTime: number;
  streamedChars?: number;
  thinkingTime?: number;
  receivedTokens?: number;
}

export function MorningstarSpinner({ startTime, streamedChars = 0, thinkingTime, receivedTokens }: SpinnerProps) {
  const { dim, info } = useTheme();
  const [frame, setFrame] = useState(0);
  const [textIdx, setTextIdx] = useState(() => Math.floor(Math.random() * SPINNER_TEXTS.length));
  const [elapsed, setElapsed] = useState("0.0");

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      const secs = (Date.now() - startTime) / 1000;
      if (secs >= 60) {
        const mins = Math.floor(secs / 60);
        const remSecs = Math.round(secs % 60);
        setElapsed(`${mins}m ${remSecs}s`);
      } else {
        setElapsed(`${secs.toFixed(1)}s`);
      }
    }, 80);
    return () => clearInterval(interval);
  }, [startTime]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTextIdx((i) => (i + 1) % SPINNER_TEXTS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const tokens = receivedTokens ?? Math.round(streamedChars / 4);
  const tokenStr = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);

  // Claude Code style: ✢ Generating… (4m 24s · ↓ 13.2k tokens · thought for 17s)
  return (
    <Box marginLeft={2}>
      <Text color={info}>{"✢ "}</Text>
      <Text color={dim}>{SPINNER_TEXTS[textIdx]}… </Text>
      <Text color={dim}>(</Text>
      <Text color={dim}>{elapsed}</Text>
      {tokens > 0 && (
        <Text color={dim}> · ↓ {tokenStr} tokens</Text>
      )}
      {thinkingTime != null && thinkingTime > 0 && (
        <Text color={dim}> · thought for {thinkingTime}s</Text>
      )}
      <Text color={dim}>)</Text>
    </Box>
  );
}
