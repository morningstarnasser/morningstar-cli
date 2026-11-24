import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { terminalReport } from "../runtime/composer-layout.js";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../hooks/useTheme.js";
/** Longest run of dots drawn before switching to a character count. */
const MAX_DOTS = 32;
/** Render a secret as dots, never as characters. */
export function maskSecret(value) {
    if (value.length === 0)
        return "";
    if (value.length <= MAX_DOTS)
        return "•".repeat(value.length);
    return `${"•".repeat(MAX_DOTS)} (${value.length})`;
}
/**
 * Hidden single-line input for API keys.
 *
 * Ink has no password field, so keystrokes are buffered here and only ever
 * rendered as dots. Pasting works because a paste arrives as one multi-character
 * `input` event.
 */
export function SecretInput({ label, hint, onSubmit, onCancel, isActive = true, }) {
    const { primary, accent, dim } = useTheme();
    const [value, setValue] = useState("");
    useInput((input, key) => {
        if (terminalReport(input))
            return;
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.return) {
            onSubmit(value.trim());
            return;
        }
        if (key.backspace || key.delete) {
            setValue((current) => current.slice(0, -1));
            return;
        }
        if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow)
            return;
        // Strip control characters a paste may carry along.
        const cleaned = input.replace(/[\r\n\t]/g, "");
        if (cleaned)
            setValue((current) => current + cleaned);
    }, { isActive });
    return (_jsxs(Box, { borderStyle: "round", borderColor: primary, flexDirection: "column", paddingX: 1, marginX: 1, marginY: 1, children: [_jsx(Text, { color: primary, bold: true, children: label }), hint ? _jsx(Text, { color: dim, children: hint }) : null, _jsx(Box, { marginTop: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "Key  " }), _jsx(Text, { color: accent, children: maskSecret(value) || "(verdeckt)" }), _jsx(Text, { color: primary, children: "\u2588" })] }) }), _jsx(Text, { color: dim, children: "Enter speichern \u00B7 Esc abbrechen \u00B7 Einf\u00FCgen erlaubt" })] }));
}
//# sourceMappingURL=SecretInput.js.map