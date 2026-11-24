import { useTerminalDetail } from "../hooks/useTerminalDetails.js";
import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { Highlighter, BundledLanguage } from "shiki";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { displayText } from "../runtime/work-log.js";

interface CodeBlockProps { code: string; lang?: string; showLineNumbers?: boolean }
let highlighter: Highlighter | null = null;
let loading: Promise<Highlighter | null> | undefined;
function loadHighlighter() {
  return loading ??= import("shiki").then(s => s.createHighlighter({
    themes: ["vitesse-dark"],
    langs: ["typescript", "javascript", "python", "go", "rust", "java", "html", "css", "json", "yaml", "bash", "sql", "markdown", "tsx", "jsx", "c", "cpp", "ruby", "php", "swift", "kotlin", "diff"],
  })).then(value => { highlighter = value; return value; }).catch(() => { loading = undefined; return null; });
}

export function CodeBlock({ code, lang = "text", showLineNumbers = false }: CodeBlockProps) {
  const t = useTheme(), columns = useTerminalColumns();
  const [ready, setReady] = useState(Boolean(highlighter));
  useEffect(() => { let active = true; void loadHighlighter().then(h => { if (active && h) setReady(true); }); return () => { active = false; }; }, []);
  const clean = displayText(code), language = displayText(lang).slice(0, 32);
  const lines = React.useMemo(() => {
    try { if (highlighter) return highlighter.codeToTokens(clean, { lang: language as BundledLanguage, theme: "vitesse-dark" }).tokens.map(line => line.map(token => ({ text: token.content, color: token.color }))); } catch { /* unknown languages remain legible */ }
    return clean.split("\n").map(line => [{ text: line, color: language === "diff" && line.startsWith("+") ? t.success : language === "diff" && line.startsWith("-") ? t.error : t.info }]);
  }, [clean, language, ready, t.success, t.error, t.info]);
  const detailBody = React.useMemo(() => lines.map(tokens => tokens.map(token => {
    const color = token.color?.match(/^#([0-9a-f]{6})$/i)?.[1];
    return color ? `\x1b[38;2;${parseInt(color.slice(0, 2), 16)};${parseInt(color.slice(2, 4), 16)};${parseInt(color.slice(4, 6), 16)}m${token.text}\x1b[0m` : token.text;
  }).join("")).join("\n"), [lines]);
  const detail = useTerminalDetail({ title: `${language} · ${lines.length} Zeilen`, body: detailBody });
  const preview = detail ? lines.slice(0, 12) : lines;
  const width = Math.max(16, Math.min(72, columns - 12));
  return <Box flexDirection="column" marginTop={1}>
    {detail ? <Text color={t.info}>{detail} · {lines.length} Zeilen</Text> : null}
    <Text color={t.dim}>╭─ <Text color={t.info} bold>{language}</Text>{"─".repeat(Math.max(1, width - language.length - 4))}╮</Text>
    {preview.map((tokens, i) => <Text key={i} wrap="wrap"><Text color={t.dim}>│ {showLineNumbers ? `${String(i + 1).padStart(3)} ` : ""}</Text>{tokens.map((token, j) => <Text key={j} color={token.color}>{token.text}</Text>)}</Text>)}
    {detail && lines.length > preview.length ? <Text color={t.dim}>│ … {lines.length - preview.length} weitere Zeilen · Details anklicken</Text> : null}
    <Text color={t.dim}>╰{"─".repeat(width - 2)}╯</Text>
  </Box>;
}
