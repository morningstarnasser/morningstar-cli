import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { terminalReport } from "../runtime/composer-layout.js";
import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { createHash } from "node:crypto";
import { useTheme } from "../hooks/useTheme.js";
import { escapeApprovalDisplay } from "../approval-display.js";
const APPROVAL_PAGE_SIZE = 1_600;
export function paginateApprovalTarget(target, pageSize = APPROVAL_PAGE_SIZE) {
    const normalized = target || "(keine Argumente)";
    const pages = [];
    for (let offset = 0; offset < normalized.length; offset += pageSize) {
        pages.push(normalized.slice(offset, offset + pageSize));
    }
    return pages.length > 0 ? pages : ["(keine Argumente)"];
}
export function ApprovalPrompt({ tool, target, reason, risk, onDecision, isActive = true, }) {
    const { primary, accent, dim, warning, error } = useTheme();
    const [selected, setSelected] = useState(1);
    const [page, setPage] = useState(0);
    const displayTarget = useMemo(() => escapeApprovalDisplay(target), [target]);
    const pages = useMemo(() => paginateApprovalTarget(displayTarget), [displayTarget]);
    const targetHash = useMemo(() => createHash("sha256").update(target).digest("hex").slice(0, 16), [target]);
    useEffect(() => {
        setSelected(1);
        setPage(0);
    }, [tool, target, reason, risk]);
    useInput((input, key) => {
        if (terminalReport(input))
            return;
        if (input === "[" && pages.length > 1) {
            setPage((current) => Math.max(0, current - 1));
            return;
        }
        if (input === "]" && pages.length > 1) {
            setPage((current) => Math.min(pages.length - 1, current + 1));
            return;
        }
        if (key.upArrow || key.leftArrow || key.tab) {
            setSelected(0);
            return;
        }
        if (key.downArrow || key.rightArrow) {
            setSelected(1);
            return;
        }
        if (input === "1" || input.toLowerCase() === "y") {
            onDecision(true);
            return;
        }
        if (input === "2" || input.toLowerCase() === "n" || key.escape) {
            onDecision(false);
            return;
        }
        if (key.return)
            onDecision(selected === 0);
    }, { isActive });
    const riskColor = risk === "high" ? error : warning;
    return (_jsxs(Box, { borderStyle: "round", borderColor: riskColor, flexDirection: "column", paddingX: 1, marginX: 1, marginY: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: riskColor, bold: true, children: "Freigabe erforderlich" }), _jsxs(Text, { color: dim, children: ["  \u00B7  ", risk, " risk"] })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "risk    " }), _jsx(Text, { color: riskColor, children: risk.toUpperCase() })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "reason  " }), _jsx(Text, { color: warning, children: reason })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "tool    " }), _jsx(Text, { color: primary, children: tool })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "args    " }), _jsxs(Text, { color: dim, children: ["Seite ", page + 1, "/", pages.length, " \u00B7 ", Buffer.byteLength(target), " Bytes \u00B7 sha256:", targetHash] })] }), _jsx(Text, { children: pages[page] }), pages.length > 1 ? (_jsx(Text, { color: dim, children: "[ vorherige Seite \u00B7 ] n\u00E4chste Seite" })) : null, _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Text, { inverse: selected === 0, children: _jsx(Text, { color: selected === 0 ? undefined : accent, children: " 1  Einmal erlauben " }) }), _jsx(Text, { inverse: selected === 1, children: _jsx(Text, { color: selected === 1 ? undefined : dim, children: " 2  Verweigern " }) })] }), _jsx(Text, { color: dim, children: "Enter best\u00E4tigt \u00B7 Esc verweigert" })] }));
}
//# sourceMappingURL=ApprovalPrompt.js.map