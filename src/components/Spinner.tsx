import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";

const SPINNER_TEXTS = [
  "Hyperspacing", "Initialisiere", "Analysiere", "Denke nach",
  "Verarbeite", "Kalkuliere", "Kompiliere", "Generiere",
  "Synthetisiere", "Evaluiere", "Optimiere", "Strukturiere",
];

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface SpinnerProps {
  startTime: number;
  streamedChars?: number;
}

export function MorningstarSpinner({ startTime, streamedChars = 0 }: SpinnerProps) {
  const { dim, info } = useTheme();
  const [frame, setFrame] = useState(0);
  const [textIdx, setTextIdx] = useState(() => Math.floor(Math.random() * SPINNER_TEXTS.length));
  const [elapsed, setElapsed] = useState("0.0");

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      setElapsed(((Date.now() - startTime) / 1000).toFixed(1));
    }, 80);
    return () => clearInterval(interval);
  }, [startTime]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTextIdx((i) => (i + 1) % SPINNER_TEXTS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const estTokens = Math.round(streamedChars / 4);
  const tokenStr = estTokens >= 1000 ? `${(estTokens / 1000).toFixed(1)}k` : String(estTokens);

  return (
    <Box marginLeft={2}>
      <Text color={info}>{SPINNER_FRAMES[frame]}</Text>
      <Text color={dim}> {SPINNER_TEXTS[textIdx]}… </Text>
      <Text color={dim}>{elapsed}s</Text>
      {streamedChars > 0 && (
        <Text color={dim}> · ~{tokenStr} tokens</Text>
      )}
    </Box>
  );
}
