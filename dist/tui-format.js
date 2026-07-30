// ─── TUI Design Primitives (#5: HUD + collapsible output + pager) ────────────
// Pure formatting helpers shared by the Telegram gateway and the Ink CLI:
//   - formatHud:      a compact status line (model · cwd · tokens · cost · turn)
//   - collapseOutput: fold long tool output to a head/tail preview
//   - paginate:       split very long text into page chunks
// Pure + fully testable; the renderers decide where to place them.
/** A one-line status HUD. Keeps only the basename of cwd for width. */
export function formatHud(s) {
    const parts = [`🧠 ${s.model}`];
    if (s.cwd)
        parts.push(`📁 ${s.cwd.split("/").filter(Boolean).pop() ?? s.cwd}`);
    if (s.tokens !== undefined)
        parts.push(`🔢 ${formatTokens(s.tokens)}`);
    if (s.costUsd !== undefined)
        parts.push(`💲${s.costUsd.toFixed(3)}`);
    if (s.turn !== undefined)
        parts.push(`↻ ${s.turn}`);
    return parts.join("  ·  ");
}
function formatTokens(n) {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
/**
 * Collapse output longer than `maxLines` to the first and last lines with a
 * "… N lines hidden …" marker. Short output is returned unchanged.
 */
export function collapseOutput(text, maxLines = 20, headTail = 6) {
    const lines = text.split("\n");
    if (lines.length <= maxLines)
        return text;
    const head = lines.slice(0, headTail);
    const tail = lines.slice(-headTail);
    const hidden = lines.length - headTail * 2;
    return [...head, `   … ${hidden} Zeilen ausgeblendet …`, ...tail].join("\n");
}
/** Split text into pages of at most `pageSize` chars, breaking on line boundaries. */
export function paginate(text, pageSize = 3500) {
    if (text.length <= pageSize)
        return text.length ? [text] : [];
    const pages = [];
    let current = "";
    for (const line of text.split("\n")) {
        if (current && current.length + line.length + 1 > pageSize) {
            pages.push(current);
            current = "";
        }
        current = current ? `${current}\n${line}` : line;
        while (current.length > pageSize) {
            pages.push(current.slice(0, pageSize));
            current = current.slice(pageSize);
        }
    }
    if (current)
        pages.push(current);
    return pages;
}
//# sourceMappingURL=tui-format.js.map