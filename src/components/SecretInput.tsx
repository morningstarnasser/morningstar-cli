import { terminalReport } from "../runtime/composer-layout.js";
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../hooks/useTheme.js";

export interface SecretInputProps {
  label: string;
  /** Second line below the prompt, e.g. where to get the key. */
  hint?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  isActive?: boolean;
}

/** Longest run of dots drawn before switching to a character count. */
const MAX_DOTS = 32;

/** Render a secret as dots, never as characters. */
export function maskSecret(value: string): string {
  if (value.length === 0) return "";
  if (value.length <= MAX_DOTS) return "•".repeat(value.length);
  return `${"•".repeat(MAX_DOTS)} (${value.length})`;
}

/**
 * Hidden single-line input for API keys.
 *
 * Ink has no password field, so keystrokes are buffered here and only ever
 * rendered as dots. Pasting works because a paste arrives as one multi-character
 * `input` event.
 */
export function SecretInput({
  label,
  hint,
  onSubmit,
  onCancel,
  isActive = true,
}: SecretInputProps) {
  const { primary, accent, dim } = useTheme();
  const [value, setValue] = useState("");

  useInput((input, key) => {
    if (terminalReport(input)) return;
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSubmit(value.trim());
      return;
    }
    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) return;
    // Strip control characters a paste may carry along.
    const cleaned = input.replace(/[\r\n\t]/g, "");
    if (cleaned) setValue((current) => current + cleaned);
  }, { isActive });

  return (
    <Box
      borderStyle="round"
      borderColor={primary}
      flexDirection="column"
      paddingX={1}
      marginX={1}
      marginY={1}
    >
      <Text color={primary} bold>{label}</Text>
      {hint ? <Text color={dim}>{hint}</Text> : null}
      <Box marginTop={1}>
        <Text>
          <Text color={dim}>Key  </Text>
          <Text color={accent}>{maskSecret(value) || "(verdeckt)"}</Text>
          <Text color={primary}>█</Text>
        </Text>
      </Box>
      <Text color={dim}>Enter speichern · Esc abbrechen · Einfügen erlaubt</Text>
    </Box>
  );
}
