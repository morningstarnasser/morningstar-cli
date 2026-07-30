// ─── Hardened Tool-Call Extraction (#1) ──────────────────────────────────────
// Jerry's review: the raw `<tool:>` regex is fine for an MVP but fragile. This
// module extracts tool calls with three safety rules, so the agent never runs a
// command the model merely *quoted*:
//   1. Tool tags inside inline-code spans (`...`) are ignored — that's where a
//      model shows a command to the user, not where it asks to run one.
//   2. Nested tool tags are ignored (args containing another <tool:>).
//   3. Oversized payloads are skipped (bounded memory / no abuse).
// Pure + fully testable. The executor maps the parsed calls to real tools.
const TOOL_RE = /<tool:(\w+)>([\s\S]*?)<\/tool(?::\w+)?>/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const DEFAULT_MAX_PAYLOAD = 200_000;
/** Ranges [start,end) covered by inline-code spans, used to reject quoted tags. */
function inlineCodeRanges(text) {
    const ranges = [];
    let m;
    const re = new RegExp(INLINE_CODE_RE);
    while ((m = re.exec(text)) !== null)
        ranges.push([m.index, m.index + m[0].length]);
    return ranges;
}
function isInside(pos, ranges) {
    return ranges.some(([s, e]) => pos >= s && pos < e);
}
/**
 * Extract executable tool calls from model output, applying the safety rules.
 * Returns calls in document order.
 */
export function extractToolCalls(text, opts = {}) {
    const maxPayload = opts.maxPayload ?? DEFAULT_MAX_PAYLOAD;
    const masked = inlineCodeRanges(text);
    const calls = [];
    const re = new RegExp(TOOL_RE);
    let m;
    while ((m = re.exec(text)) !== null) {
        const [raw, name, args] = m;
        if (isInside(m.index, masked))
            continue; // quoted in inline code → ignore
        if (/<tool:\w+>/.test(args))
            continue; // nested tool tag → ignore
        if (args.length > maxPayload)
            continue; // oversized → skip
        calls.push({ name, args, raw, index: m.index });
    }
    return calls;
}
//# sourceMappingURL=tool-parser.js.map