import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
const SPINNER_TEXTS = [
    "Hyperspacing", "Initialisiere", "Analysiere", "Denke nach",
    "Verarbeite", "Kalkuliere", "Kompiliere", "Generiere",
    "Synthetisiere", "Evaluiere", "Optimiere", "Strukturiere",
];
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export function MorningstarSpinner({ startTime, streamedChars = 0 }) {
    const { dim, info } = useTheme();
    const [frame, setFrame] = useState(0);
    const [textIdx, setTextIdx] = useState(() => Math.floor(Math.random() * SPINNER_TEXTS.length));
    const [elapsed, setElapsed] = useState("0.0");
    useEffect(() => {
        const interval = setInterval(() => {
            setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
            setElapsed(((Date.now() - startTime) / 1000).toFixed(1));
        }, 80);
        return () => clearInterval(interval);
    }, [startTime]);
    useEffect(() => {
        const interval = setInterval(() => {
            setTextIdx((i) => (i + 1) % SPINNER_TEXTS.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);
    const estTokens = Math.round(streamedChars / 4);
    const tokenStr = estTokens >= 1000 ? `${(estTokens / 1000).toFixed(1)}k` : String(estTokens);
    return (_jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { color: info, children: SPINNER_FRAMES[frame] }), _jsxs(Text, { color: dim, children: [" ", SPINNER_TEXTS[textIdx], "\u2026 "] }), _jsxs(Text, { color: dim, children: [elapsed, "s"] }), streamedChars > 0 && (_jsxs(Text, { color: dim, children: [" \u00B7 ~", tokenStr, " tokens"] }))] }));
}
//# sourceMappingURL=Spinner.js.map