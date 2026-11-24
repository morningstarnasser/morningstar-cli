import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { Lexer, type Token, type Tokens } from "marked";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { displayText } from "../runtime/work-log.js";
import { CodeBlock } from "./CodeBlock.js";

/** No HTML/ANSI execution: Markdown becomes Ink elements, never terminal commands. */
export function markdownTokens(text: string): Token[] {
  return Lexer.lex(displayText(text), { gfm: true });
}

function Inline({ tokens }: { tokens: Token[] }) {
  const t = useTheme();
  return <>{tokens.map((token, i) => {
    const child = "tokens" in token && token.tokens ? <Inline tokens={token.tokens} /> : displayText("text" in token ? token.text : token.raw);
    switch (token.type) {
      case "strong": return <Text key={i} bold color={t.accent}>{child}</Text>;
      case "em": return <Text key={i} italic>{child}</Text>;
      case "codespan": return <Text key={i} color={t.info}>{token.text}</Text>;
      case "del": return <Text key={i} strikethrough color={t.dim}>{child}</Text>;
      case "br": return <Text key={i}>{"\n"}</Text>;
      case "link": return <Text key={i} color={t.info} underline>{child}{token.href !== token.text ? ` (${displayText(token.href)})` : ""}</Text>;
      case "image": return <Text key={i} color={t.info}>[Bild: {token.text || token.href}]</Text>;
      default: return <Text key={i}>{child}</Text>;
    }
  })}</>;
}

function Blocks({ tokens, compact = false }: { tokens: Token[]; compact?: boolean }) {
  const t = useTheme(), columns = useTerminalColumns();
  return <Box flexDirection="column">{tokens.map((token, i) => {
    const inline = <Inline tokens={("tokens" in token ? token.tokens : undefined) ?? Lexer.lexInline("text" in token ? token.text : token.raw)} />;
    const gap = !compact && i > 0 ? 1 : 0;
    switch (token.type) {
      case "space": case "def": return null;
      case "code": return <CodeBlock key={i} code={token.text} lang={token.lang?.split(/\s/)[0]} />;
      case "heading": return <Box key={i} marginTop={gap}><Text color={t.primary} bold>{inline}</Text></Box>;
      case "hr": return <Text key={i} color={t.dim}>{"─".repeat(Math.max(8, Math.min(56, columns - 10)))}</Text>;
      case "blockquote": return <Box key={i} marginTop={gap}><Text color={t.dim}>│ </Text><Box flexGrow={1} flexShrink={1}><Blocks tokens={token.tokens ?? []} /></Box></Box>;
      case "list": return <Box key={i} marginTop={gap} flexDirection="column">{(token.items as Tokens.ListItem[]).map((item, n) => <Box key={n}>
        <Text color={item.task && item.checked ? t.success : t.accent}>{item.task ? item.checked ? "✓ " : "☐ " : token.ordered ? `${Number(token.start) + n}. ` : "• "}</Text>
        <Box flexGrow={1} flexShrink={1}><Blocks tokens={item.tokens} compact={!token.loose} /></Box>
      </Box>)}</Box>;
      case "table": {
        const table = token as Tokens.Table;
        // Stack columns on small terminals so long values stay readable.
        return <Box key={i} marginTop={gap} flexDirection="column">{table.rows.map((row, r) => <Box key={r} flexDirection={columns < 85 ? "column" : "row"} marginTop={r ? 1 : 0}>
          {row.map((cell, c) => <Box key={c} flexDirection="column" flexGrow={1} flexBasis={0} flexShrink={1} paddingRight={2}>
            <Text bold color={t.primary}><Inline tokens={table.header[c]?.tokens ?? []} /></Text><Text><Inline tokens={cell.tokens} /></Text>
          </Box>)}
        </Box>)}</Box>;
      }
      default: return <Box key={i} marginTop={gap}><Text wrap="wrap">{inline}</Text></Box>;
    }
  })}</Box>;
}

export function Markdown({ text }: { text: string }) {
  const tokens = useMemo(() => markdownTokens(text), [text]);
  return <Blocks tokens={tokens} />;
}
