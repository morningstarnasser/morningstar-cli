/** Render untrusted tool arguments without terminal-control or bidi spoofing. */
export function escapeApprovalDisplay(value) {
    let escaped = "";
    for (const character of value) {
        const codePoint = character.codePointAt(0);
        const isControl = codePoint <= 0x1f
            || (codePoint >= 0x7f && codePoint <= 0x9f);
        const isInvisibleOrBidi = (codePoint >= 0x200b && codePoint <= 0x200f)
            || (codePoint >= 0x202a && codePoint <= 0x202e)
            || (codePoint >= 0x2060 && codePoint <= 0x206f)
            || codePoint === 0xfeff;
        if (isControl || isInvisibleOrBidi) {
            escaped += codePoint <= 0xff
                ? `\\x${codePoint.toString(16).padStart(2, "0")}`
                : `\\u{${codePoint.toString(16)}}`;
            continue;
        }
        escaped += character;
    }
    return escaped;
}
//# sourceMappingURL=approval-display.js.map