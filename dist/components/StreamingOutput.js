import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { CodeBlock } from "./CodeBlock.js";
import { PlanBox } from "./PlanBox.js";
function parseBlocks(text) {
    const blocks = [];
    // First strip <tool:write> blocks — show compact summary instead of full code
    let cleaned = text.replace(/<tool:write>([^\n]+)\n([\s\S]*?)<\/tool(?::write)?>/g, (_m, path, content) => {
        const lineCount = content.split("\n").length;
        return `\n✦ Writing ${path.trim()} (${lineCount} lines)\n`;
    });
    // Also collapse unclosed <tool:write> blocks (still streaming)
    cleaned = cleaned.replace(/<tool:write>([^\n]+)\n([\s\S]{200,})$/g, (_m, path, content) => {
        const lineCount = content.split("\n").length;
        return `\n✦ Writing ${path.trim()} (${lineCount} lines so far...)\n`;
    });
    // Collapse <tool:edit> blocks too
    cleaned = cleaned.replace(/<tool:edit>([\s\S]*?)<\/tool(?::edit)?>/g, (_m, content) => {
        const pathMatch = content.match(/^([^\n]+)/);
        return `\n✦ Editing ${pathMatch?.[1]?.trim() || "file"}\n`;
    });
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIdx = 0;
    let match;
    while ((match = codeBlockRegex.exec(cleaned)) !== null) {
        const before = cleaned.slice(lastIdx, match.index);
        if (before.trim()) {
            blocks.push({ type: "text", content: before });
        }
        const codeContent = match[2];
        const codeLines = codeContent.split("\n");
        // Collapse large code blocks (>15 lines) to compact summary
        if (codeLines.length > 15) {
            const lang = match[1] || "code";
            blocks.push({ type: "text", content: `  ✦ ${lang} block (${codeLines.length} lines)` });
        }
        else {
            blocks.push({ type: "code", content: codeContent.replace(/\n$/, ""), lang: match[1] || undefined });
        }
        lastIdx = match.index + match[0].length;
    }
    const remaining = cleaned.slice(lastIdx);
    if (remaining.trim()) {
        blocks.push({ type: "text", content: remaining });
    }
    return blocks;
}
// ── Live tokens-per-second estimator (4 chars ≈ 1 token) ──
function useTokensPerSecond(text, isStreaming, startTime) {
    const [tps, setTps] = useState(0);
    const lastCheck = useRef({ t: startTime, chars: 0 });
    useEffect(() => {
        if (!isStreaming) {
            setTps(0);
            lastCheck.current = { t: startTime, chars: 0 };
            return;
        }
        const id = setInterval(() => {
            const now = Date.now();
            const dt = Math.max(1, now - lastCheck.current.t);
            const dChars = text.length - lastCheck.current.chars;
            if (dChars > 0) {
                const instant = (dChars / 4) / (dt / 1000);
                // EMA smoothing
                setTps((prev) => (prev === 0 ? instant : prev * 0.6 + instant * 0.4));
                lastCheck.current = { t: now, chars: text.length };
            }
        }, 400);
        return () => clearInterval(id);
    }, [isStreaming, text, startTime]);
    return tps;
}
// ── Animated cursor ──
const CURSOR_FRAMES = ["▌", "▎", "▏", "▎"];
function useCursor(isStreaming) {
    const [idx, setIdx] = useState(0);
    useEffect(() => {
        if (!isStreaming)
            return;
        const id = setInterval(() => setIdx((i) => (i + 1) % CURSOR_FRAMES.length), 180);
        return () => clearInterval(id);
    }, [isStreaming]);
    return CURSOR_FRAMES[idx];
}
function formatElapsed(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60)
        return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    return `${m}m ${rem}s`;
}
export function StreamingOutput({ text, reasoning, isStreaming, startTime }) {
    const { primary, accent, dim, info, success, warning } = useTheme();
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!isStreaming)
            return;
        const id = setInterval(() => setNow(Date.now()), 300);
        return () => clearInterval(id);
    }, [isStreaming]);
    const elapsed = (isStreaming ? now : Date.now()) - startTime;
    const tps = useTokensPerSecond(text, isStreaming, startTime);
    const cursor = useCursor(isStreaming);
    // Parse text into blocks
    const blocks = useMemo(() => parseBlocks(text), [text]);
    // Check if text ends with an unclosed code block (still streaming)
    const hasUnclosedCode = useMemo(() => {
        const openCount = (text.match(/```/g) || []).length;
        return openCount % 2 !== 0;
    }, [text]);
    const estimatedTokens = Math.ceil(text.length / 4);
    return (_jsxs(Box, { flexDirection: "column", children: [reasoning && _jsx(PlanBox, { reasoning: reasoning, elapsed: elapsed }), text && (_jsxs(Box, { flexDirection: "column", marginLeft: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: accent, children: "\u25CF " }), _jsx(Text, { color: primary, children: "assistant" }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: isStreaming ? warning : success, children: isStreaming ? "streaming" : "complete" }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: info, children: formatElapsed(elapsed) }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: info, children: estimatedTokens.toLocaleString() }), _jsx(Text, { color: dim, children: " tok" }), isStreaming && tps > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: accent, children: tps.toFixed(0) }), _jsx(Text, { color: dim, children: " t/s" })] }))] }), blocks.map((block, i) => {
                        if (block.type === "code") {
                            return _jsx(CodeBlock, { code: block.content.replace(/\n$/, ""), lang: block.lang }, i);
                        }
                        return (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { wrap: "wrap", children: block.content }) }, i));
                    }), isStreaming && (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { color: hasUnclosedCode ? warning : accent, children: cursor }) }))] }))] }));
}
//# sourceMappingURL=StreamingOutput.js.map