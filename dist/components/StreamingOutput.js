import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { Markdown } from "./Markdown.js";
import { PlanBox } from "./PlanBox.js";
function responseMarkdown(text) {
    return text.replace(/<tool:write>([^\n]+)\n([\s\S]*?)<\/tool(?::write)?>/g, (_m, path, content) => `\n✦ Writing ${String(path).trim()} (${content.split("\n").length} lines)\n`)
        .replace(/<tool:edit>([\s\S]*?)<\/tool(?::edit)?>/g, (_m, content) => `\n✦ Editing ${String(content).split("\n")[0]}\n`);
}
// ── Live tokens-per-second estimator (4 chars ≈ 1 token) ──
function useTokensPerSecond(text, isStreaming, startTime) {
    const [tps, setTps] = useState(0);
    const lastCheck = useRef({ t: startTime, chars: 0 });
    const latestLength = useRef(text.length);
    latestLength.current = text.length;
    useEffect(() => {
        if (!isStreaming) {
            setTps(0);
            lastCheck.current = { t: startTime, chars: 0 };
            return;
        }
        lastCheck.current = { t: startTime, chars: 0 };
        const id = setInterval(() => {
            const now = Date.now();
            const dt = Math.max(1, now - lastCheck.current.t);
            const dChars = latestLength.current - lastCheck.current.chars;
            if (dChars > 0) {
                const instant = (dChars / 4) / (dt / 1000);
                // EMA smoothing
                setTps((prev) => (prev === 0 ? instant : prev * 0.6 + instant * 0.4));
                lastCheck.current = { t: now, chars: latestLength.current };
            }
        }, 400);
        return () => clearInterval(id);
    }, [isStreaming, startTime]);
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
    // Guard against a missing/garbage startTime (e.g. persisted or restored
    // messages where startTime is 0/undefined) producing absurd durations like
    // "29712296m". Only treat the elapsed time as real when it is sane.
    const MAX_SANE_ELAPSED_MS = 24 * 60 * 60 * 1000;
    const rawElapsed = (isStreaming ? now : Date.now()) - startTime;
    const elapsed = startTime > 0 && rawElapsed >= 0 && rawElapsed < MAX_SANE_ELAPSED_MS ? rawElapsed : 0;
    const showElapsed = elapsed > 0;
    const tps = useTokensPerSecond(text, isStreaming, startTime);
    const cursor = useCursor(isStreaming);
    // Parse text into blocks
    const markdown = useMemo(() => responseMarkdown(text), [text]);
    // Check if text ends with an unclosed code block (still streaming)
    const hasUnclosedCode = useMemo(() => {
        const openCount = (text.match(/```/g) || []).length;
        return openCount % 2 !== 0;
    }, [text]);
    const estimatedTokens = Math.ceil(text.length / 4);
    return (_jsxs(Box, { flexDirection: "column", children: [reasoning && _jsx(PlanBox, { reasoning: reasoning, elapsed: elapsed }), text && (_jsxs(Box, { flexDirection: "column", marginLeft: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: accent, children: "\u25CF " }), _jsx(Text, { color: primary, children: "assistant" }), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: isStreaming ? warning : success, children: isStreaming ? "streaming" : "complete" }), showElapsed && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: info, children: formatElapsed(elapsed) })] })), _jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: info, children: estimatedTokens.toLocaleString() }), _jsx(Text, { color: dim, children: " tok" }), isStreaming && tps > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "  \u00B7  " }), _jsx(Text, { color: accent, children: tps.toFixed(0) }), _jsx(Text, { color: dim, children: " t/s" })] }))] }), _jsx(Box, { marginLeft: 2, flexDirection: "column", children: _jsx(Markdown, { text: markdown }) }), isStreaming && (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { color: hasUnclosedCode ? warning : accent, children: cursor }) }))] }))] }));
}
//# sourceMappingURL=StreamingOutput.js.map