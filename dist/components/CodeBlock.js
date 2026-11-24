import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useTerminalDetail } from "../hooks/useTerminalDetails.js";
import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { displayText } from "../runtime/work-log.js";
let highlighter = null;
let loading;
function loadHighlighter() {
    return loading ??= import("shiki").then(s => s.createHighlighter({
        themes: ["vitesse-dark"],
        langs: ["typescript", "javascript", "python", "go", "rust", "java", "html", "css", "json", "yaml", "bash", "sql", "markdown", "tsx", "jsx", "c", "cpp", "ruby", "php", "swift", "kotlin", "diff"],
    })).then(value => { highlighter = value; return value; }).catch(() => { loading = undefined; return null; });
}
export function CodeBlock({ code, lang = "text", showLineNumbers = false }) {
    const t = useTheme(), columns = useTerminalColumns();
    const [ready, setReady] = useState(Boolean(highlighter));
    useEffect(() => { let active = true; void loadHighlighter().then(h => { if (active && h)
        setReady(true); }); return () => { active = false; }; }, []);
    const clean = displayText(code), language = displayText(lang).slice(0, 32);
    const lines = React.useMemo(() => {
        try {
            if (highlighter)
                return highlighter.codeToTokens(clean, { lang: language, theme: "vitesse-dark" }).tokens.map(line => line.map(token => ({ text: token.content, color: token.color })));
        }
        catch { /* unknown languages remain legible */ }
        return clean.split("\n").map(line => [{ text: line, color: language === "diff" && line.startsWith("+") ? t.success : language === "diff" && line.startsWith("-") ? t.error : t.info }]);
    }, [clean, language, ready, t.success, t.error, t.info]);
    const detailBody = React.useMemo(() => lines.map(tokens => tokens.map(token => {
        const color = token.color?.match(/^#([0-9a-f]{6})$/i)?.[1];
        return color ? `\x1b[38;2;${parseInt(color.slice(0, 2), 16)};${parseInt(color.slice(2, 4), 16)};${parseInt(color.slice(4, 6), 16)}m${token.text}\x1b[0m` : token.text;
    }).join("")).join("\n"), [lines]);
    const detail = useTerminalDetail({ title: `${language} · ${lines.length} Zeilen`, body: detailBody });
    const preview = detail ? lines.slice(0, 12) : lines;
    const width = Math.max(16, Math.min(72, columns - 12));
    return _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [detail ? _jsxs(Text, { color: t.info, children: [detail, " \u00B7 ", lines.length, " Zeilen"] }) : null, _jsxs(Text, { color: t.dim, children: ["\u256D\u2500 ", _jsx(Text, { color: t.info, bold: true, children: language }), "─".repeat(Math.max(1, width - language.length - 4)), "\u256E"] }), preview.map((tokens, i) => _jsxs(Text, { wrap: "wrap", children: [_jsxs(Text, { color: t.dim, children: ["\u2502 ", showLineNumbers ? `${String(i + 1).padStart(3)} ` : ""] }), tokens.map((token, j) => _jsx(Text, { color: token.color, children: token.text }, j))] }, i)), detail && lines.length > preview.length ? _jsxs(Text, { color: t.dim, children: ["\u2502 \u2026 ", lines.length - preview.length, " weitere Zeilen \u00B7 Details anklicken"] }) : null, _jsxs(Text, { color: t.dim, children: ["\u2570", "─".repeat(width - 2), "\u256F"] })] });
}
//# sourceMappingURL=CodeBlock.js.map