// ─── YAML Frontmatter Parser ─────────────────────────────
// Shared utility for parsing YAML frontmatter from .md files
// Used by Skills, File-Agents, and Rules systems
/**
 * Parse YAML-like frontmatter from a markdown string.
 * Supports --- delimited frontmatter blocks.
 * Returns parsed key-value pairs and the remaining content.
 */
export function parseFrontmatter(raw) {
    const trimmed = raw.trimStart();
    if (!trimmed.startsWith("---")) {
        return { frontmatter: {}, content: raw };
    }
    const endIdx = trimmed.indexOf("---", 3);
    if (endIdx === -1) {
        return { frontmatter: {}, content: raw };
    }
    const fmBlock = trimmed.slice(3, endIdx).trim();
    const content = trimmed.slice(endIdx + 3).trim();
    const frontmatter = {};
    for (const line of fmBlock.split("\n")) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#"))
            continue;
        const colonIdx = trimmedLine.indexOf(":");
        if (colonIdx === -1)
            continue;
        const key = trimmedLine.slice(0, colonIdx).trim();
        let value = trimmedLine.slice(colonIdx + 1).trim();
        // Parse arrays: [item1, item2] or - item
        if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
            value = value.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        }
        // Parse numbers
        else if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) {
            value = parseFloat(value);
        }
        // Parse booleans
        else if (value === "true")
            value = true;
        else if (value === "false")
            value = false;
        // Strip quotes from strings
        else if (typeof value === "string" && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
            value = value.slice(1, -1);
        }
        frontmatter[key] = value;
    }
    return { frontmatter: frontmatter, content };
}
/**
 * Serialize frontmatter and content back to a markdown string.
 */
export function serializeFrontmatter(frontmatter, content) {
    const lines = ["---"];
    for (const [key, value] of Object.entries(frontmatter)) {
        if (value === undefined || value === null)
            continue;
        if (Array.isArray(value)) {
            lines.push(`${key}: [${value.map(v => typeof v === "string" ? `"${v}"` : String(v)).join(", ")}]`);
        }
        else if (typeof value === "string") {
            lines.push(`${key}: "${value}"`);
        }
        else {
            lines.push(`${key}: ${String(value)}`);
        }
    }
    lines.push("---");
    lines.push("");
    lines.push(content);
    return lines.join("\n");
}
//# sourceMappingURL=frontmatter.js.map