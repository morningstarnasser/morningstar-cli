import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";

interface CodeBlockProps {
  code: string;
  lang?: string;
  showLineNumbers?: boolean;
}

// Shiki-based syntax highlighting with fallback
let shikiHighlighter: any = null;
let shikiLoading = false;
let shikiReady = false;

async function getHighlighter() {
  if (shikiReady) return shikiHighlighter;
  if (shikiLoading) return null;
  shikiLoading = true;
  try {
    const shiki = await import("shiki");
    shikiHighlighter = await shiki.createHighlighter({
      themes: ["vitesse-dark"],
      langs: [
        "typescript", "javascript", "python", "go", "rust", "java",
        "html", "css", "json", "yaml", "bash", "sql", "markdown",
        "tsx", "jsx", "c", "cpp", "ruby", "php", "swift", "kotlin",
      ],
    });
    shikiReady = true;
    return shikiHighlighter;
  } catch {
    shikiLoading = false;
    return null;
  }
}

// Initialize shiki eagerly
getHighlighter();

interface AnsiToken {
  text: string;
  color?: string;
}

function parseShikiAnsi(ansiStr: string): AnsiToken[][] {
  // Parse ANSI escape sequences into colored tokens per line
  const lines = ansiStr.split("\n");
  const result: AnsiToken[][] = [];

  for (const line of lines) {
    const tokens: AnsiToken[] = [];
    let currentColor: string | undefined;
    let buf = "";
    let i = 0;

    while (i < line.length) {
      if (line[i] === "\x1b" && line[i + 1] === "[") {
        // Flush buffer
        if (buf) { tokens.push({ text: buf, color: currentColor }); buf = ""; }
        // Find end of escape
        let j = i + 2;
        while (j < line.length && line[j] !== "m") j++;
        const code = line.slice(i + 2, j);
        if (code === "0" || code === "") {
          currentColor = undefined;
        } else if (code.startsWith("38;2;")) {
          // RGB color: 38;2;R;G;B
          const parts = code.split(";");
          if (parts.length >= 5) {
            const r = parseInt(parts[2]);
            const g = parseInt(parts[3]);
            const b = parseInt(parts[4]);
            currentColor = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
          }
        }
        i = j + 1;
      } else {
        buf += line[i];
        i++;
      }
    }
    if (buf) tokens.push({ text: buf, color: currentColor });
    result.push(tokens);
  }
  return result;
}

export function CodeBlock({ code, lang = "", showLineNumbers = false }: CodeBlockProps) {
  const { dim, info } = useTheme();
  const [highlighted, setHighlighted] = useState<AnsiToken[][] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hl = await getHighlighter();
      if (cancelled || !hl) return;
      try {
        const result = hl.codeToAnsi(code, {
          lang: lang || "plaintext",
          theme: "vitesse-dark",
        });
        if (!cancelled) {
          setHighlighted(parseShikiAnsi(result));
        }
      } catch {
        // Fallback: no highlighting
      }
    })();
    return () => { cancelled = true; };
  }, [code, lang]);

  const BOX_W = 72;
  const codeLines: AnsiToken[][] = highlighted || code.split("\n").map((l) => [{ text: l }]);
  const langLabel = lang ? ` ${lang} ` : "";

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      {/* Header */}
      <Text color={dim}>
        {"  ┌─"}<Text color={info} bold>{langLabel}</Text>{"─".repeat(Math.max(0, BOX_W - langLabel.length - 1))}{"┐"}
      </Text>
      {/* Code lines */}
      {codeLines.map((tokens, lineIdx) => (
        <Box key={lineIdx}>
          <Text color={dim}>{"  │ "}</Text>
          {showLineNumbers && (
            <Text color={dim}>{String(lineIdx + 1).padStart(3)} </Text>
          )}
          {tokens.map((token, tokenIdx) => (
            <Text key={tokenIdx} color={token.color}>{token.text}</Text>
          ))}
        </Box>
      ))}
      {/* Footer */}
      <Text color={dim}>{"  └" + "─".repeat(BOX_W) + "┘"}</Text>
    </Box>
  );
}
