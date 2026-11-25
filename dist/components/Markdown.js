import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo } from "react";
import { Box, Text } from "ink";
import { Lexer } from "marked";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { displayText } from "../runtime/work-log.js";
import { CodeBlock } from "./CodeBlock.js";
import stringWidth from "string-width";
/** No HTML/ANSI execution: Markdown becomes Ink elements, never terminal commands. */
export function markdownTokens(text) {
    return Lexer.lex(displayText(text), { gfm: true });
}
function Inline({ tokens }) {
    const t = useTheme();
    return _jsx(_Fragment, { children: tokens.map((token, i) => {
            const child = "tokens" in token && token.tokens ? _jsx(Inline, { tokens: token.tokens }) : displayText("text" in token ? token.text : token.raw);
            switch (token.type) {
                case "strong": return _jsx(Text, { bold: true, color: t.accent, children: child }, i);
                case "em": return _jsx(Text, { italic: true, children: child }, i);
                case "codespan": return _jsx(Text, { color: t.info, children: token.text }, i);
                case "del": return _jsx(Text, { strikethrough: true, color: t.dim, children: child }, i);
                case "br": return _jsx(Text, { children: "\n" }, i);
                case "link": return _jsxs(Text, { color: t.info, underline: true, children: [child, token.href !== token.text ? ` (${displayText(token.href)})` : ""] }, i);
                case "image": return _jsxs(Text, { color: t.info, children: ["[Bild: ", token.text || token.href, "]"] }, i);
                default: return _jsx(Text, { children: child }, i);
            }
        }) });
}
function Blocks({ tokens, compact = false }) {
    const t = useTheme(), columns = useTerminalColumns();
    return _jsx(Box, { flexDirection: "column", children: tokens.map((token, i) => {
            const inline = _jsx(Inline, { tokens: ("tokens" in token ? token.tokens : undefined) ?? Lexer.lexInline("text" in token ? token.text : token.raw) });
            const gap = !compact && i > 0 ? 1 : 0;
            switch (token.type) {
                case "space":
                case "def": return null;
                case "code": return _jsx(CodeBlock, { code: token.text, lang: token.lang?.split(/\s/)[0] }, i);
                case "heading": return _jsx(Box, { marginTop: gap, children: _jsx(Text, { color: t.primary, bold: true, children: inline }) }, i);
                case "hr": return _jsx(Text, { color: t.dim, children: "─".repeat(Math.max(8, Math.min(56, columns - 10))) }, i);
                case "blockquote": return _jsxs(Box, { marginTop: gap, children: [_jsx(Text, { color: t.dim, children: "\u2502 " }), _jsx(Box, { flexGrow: 1, flexShrink: 1, children: _jsx(Blocks, { tokens: token.tokens ?? [] }) })] }, i);
                case "list": return _jsx(Box, { marginTop: gap, flexDirection: "column", children: token.items.map((item, n) => _jsxs(Box, { children: [_jsx(Text, { color: item.task && item.checked ? t.success : t.accent, children: item.task ? item.checked ? "✓ " : "☐ " : token.ordered ? `${Number(token.start) + n}. ` : "• " }), _jsx(Box, { flexGrow: 1, flexShrink: 1, children: _jsx(Blocks, { tokens: item.tokens, compact: !token.loose }) })] }, n)) }, i);
                case "table": {
                    const table = token;
                    const available = Math.max(16, Math.min(110, columns - 8));
                    const count = table.header.length;
                    const widths = table.header.map((header, c) => Math.max(8, ...[header, ...table.rows.map(row => row[c])].filter(Boolean).map(cell => Math.min(80, stringWidth(displayText(cell.text))))));
                    const minimum = count * 8 + Math.max(0, count - 1) * 3;
                    if (minimum <= available && columns >= 60) {
                        while (widths.reduce((a, b) => a + b, 0) + (count - 1) * 3 > available) {
                            const widest = widths.indexOf(Math.max(...widths));
                            widths[widest]--;
                        }
                        const row = (cells, header, key) => _jsx(Box, { children: table.header.map((_, c) => _jsx(Box, { width: widths[c], flexShrink: 0, marginRight: c < count - 1 ? 3 : 0, children: _jsx(Text, { bold: header, color: header ? t.primary : undefined, wrap: "wrap", children: _jsx(Inline, { tokens: cells[c]?.tokens ?? [] }) }) }, c)) }, key);
                        return _jsxs(Box, { marginTop: gap, flexDirection: "column", alignSelf: "flex-start", children: [row(table.header, true, -1), _jsx(Text, { color: t.dim, children: widths.map(width => "─".repeat(width)).join("   ") }), table.rows.map((cells, r) => row(cells, false, r))] }, i);
                    }
                    // Narrow terminals use compact records, with the first cell as identity.
                    return _jsx(Box, { marginTop: gap, flexDirection: "column", children: table.rows.map((cells, r) => _jsx(Box, { flexDirection: "column", marginTop: r && count > 2 ? 1 : 0, children: count === 2 ? _jsxs(Text, { wrap: "wrap", children: [_jsxs(Text, { bold: true, color: t.primary, children: [_jsx(Inline, { tokens: cells[0]?.tokens ?? [] }), ": "] }), _jsx(Inline, { tokens: cells[1]?.tokens ?? [] })] }) : _jsxs(_Fragment, { children: [_jsx(Text, { bold: true, color: t.primary, children: _jsx(Inline, { tokens: cells[0]?.tokens ?? [] }) }), cells.slice(1).map((cell, c) => _jsxs(Text, { wrap: "wrap", children: [_jsxs(Text, { color: t.dim, children: [_jsx(Inline, { tokens: table.header[c + 1]?.tokens ?? [] }), ": "] }), _jsx(Inline, { tokens: cell.tokens })] }, c))] }) }, r)) }, i);
                }
                default: return _jsx(Box, { marginTop: gap, children: _jsx(Text, { wrap: "wrap", children: inline }) }, i);
            }
        }) });
}
export function Markdown({ text }) {
    const tokens = useMemo(() => markdownTokens(text), [text]);
    return _jsx(Blocks, { tokens: tokens });
}
//# sourceMappingURL=Markdown.js.map