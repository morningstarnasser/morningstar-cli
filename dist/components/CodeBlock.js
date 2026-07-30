import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
// Shiki-based syntax highlighting with fallback
let shikiHighlighter = null;
let shikiLoading = false;
let shikiReady = false;
async function getHighlighter() {
    if (shikiReady)
        return shikiHighlighter;
    if (shikiLoading)
        return null;
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
    }
    catch {
        shikiLoading = false;
        return null;
    }
}
// Initialize shiki eagerly
getHighlighter();
function parseShikiAnsi(ansiStr) {
    // Parse ANSI escape sequences into colored tokens per line
    const lines = ansiStr.split("\n");
    const result = [];
    for (const line of lines) {
        const tokens = [];
        let currentColor;
        let buf = "";
        let i = 0;
        while (i < line.length) {
            if (line[i] === "\x1b" && line[i + 1] === "[") {
                // Flush buffer
                if (buf) {
                    tokens.push({ text: buf, color: currentColor });
                    buf = "";
                }
                // Find end of escape
                let j = i + 2;
                while (j < line.length && line[j] !== "m")
                    j++;
                const code = line.slice(i + 2, j);
                if (code === "0" || code === "") {
                    currentColor = undefined;
                }
                else if (code.startsWith("38;2;")) {
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
            }
            else {
                buf += line[i];
                i++;
            }
        }
        if (buf)
            tokens.push({ text: buf, color: currentColor });
        result.push(tokens);
    }
    return result;
}
export function CodeBlock({ code, lang = "", showLineNumbers = false }) {
    const { dim, info } = useTheme();
    const [highlighted, setHighlighted] = useState(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const hl = await getHighlighter();
            if (cancelled || !hl)
                return;
            try {
                const result = hl.codeToAnsi(code, {
                    lang: lang || "plaintext",
                    theme: "vitesse-dark",
                });
                if (!cancelled) {
                    setHighlighted(parseShikiAnsi(result));
                }
            }
            catch {
                // Fallback: no highlighting
            }
        })();
        return () => { cancelled = true; };
    }, [code, lang]);
    const BOX_W = 72;
    const codeLines = highlighted || code.split("\n").map((l) => [{ text: l }]);
    const langLabel = lang ? ` ${lang} ` : "";
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 2, marginY: 1, children: [_jsxs(Text, { color: dim, children: ["  ┌─", _jsx(Text, { color: info, bold: true, children: langLabel }), "─".repeat(Math.max(0, BOX_W - langLabel.length - 1)), "┐"] }), codeLines.map((tokens, lineIdx) => (_jsxs(Box, { children: [_jsx(Text, { color: dim, children: "  │ " }), showLineNumbers && (_jsxs(Text, { color: dim, children: [String(lineIdx + 1).padStart(3), " "] })), tokens.map((token, tokenIdx) => (_jsx(Text, { color: token.color, children: token.text }, tokenIdx)))] }, lineIdx))), _jsx(Text, { color: dim, children: "  └" + "─".repeat(BOX_W) + "┘" })] }));
}
//# sourceMappingURL=CodeBlock.js.map