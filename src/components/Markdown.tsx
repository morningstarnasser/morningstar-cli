import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { Lexer, type Token, type Tokens } from "marked";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { displayText } from "../runtime/work-log.js";
import { CodeBlock } from "./CodeBlock.js";
import stringWidth from "string-width";
import { DocumentLinkText } from "../hooks/useTerminalDocuments.js";

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
      case "link": return <DocumentLinkText key={i} label={displayText(token.text)} href={token.href} />;
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
        const available = Math.max(16, Math.min(110, columns - 8));
        const count = table.header.length;
        const widths = table.header.map((header, c) => Math.max(8, ...[header, ...table.rows.map(row => row[c])].filter(Boolean).map(cell => Math.min(80, stringWidth(displayText(cell.text))))));
        const minimum = count * 8 + Math.max(0, count - 1) * 3;
        if (minimum <= available && columns >= 60) {
          while (widths.reduce((a, b) => a + b, 0) + (count - 1) * 3 > available) {
            const widest = widths.indexOf(Math.max(...widths)); widths[widest]--;
          }
          const row = (cells: Tokens.TableCell[], header: boolean, key: number) => <Box key={key}>
            {table.header.map((_, c) => <Box key={c} width={widths[c]} flexShrink={0} marginRight={c < count - 1 ? 3 : 0}>
              <Text bold={header} color={header ? t.primary : undefined} wrap="wrap"><Inline tokens={cells[c]?.tokens ?? []} /></Text>
            </Box>)}
          </Box>;
          return <Box key={i} marginTop={gap} flexDirection="column" alignSelf="flex-start">
            {row(table.header, true, -1)}
            <Text color={t.dim}>{widths.map(width => "─".repeat(width)).join("   ")}</Text>
            {table.rows.map((cells, r) => row(cells, false, r))}
          </Box>;
        }
        // Narrow terminals use compact records, with the first cell as identity.
        return <Box key={i} marginTop={gap} flexDirection="column">{table.rows.map((cells, r) => <Box key={r} flexDirection="column" marginTop={r && count > 2 ? 1 : 0}>
          {count === 2 ? <Text wrap="wrap"><Text bold color={t.primary}><Inline tokens={cells[0]?.tokens ?? []} />: </Text><Inline tokens={cells[1]?.tokens ?? []} /></Text> : <>
            <Text bold color={t.primary}><Inline tokens={cells[0]?.tokens ?? []} /></Text>
            {cells.slice(1).map((cell, c) => <Text key={c} wrap="wrap"><Text color={t.dim}><Inline tokens={table.header[c + 1]?.tokens ?? []} />: </Text><Inline tokens={cell.tokens} /></Text>)}
          </>}
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
