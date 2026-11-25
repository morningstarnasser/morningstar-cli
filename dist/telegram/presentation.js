import { marked } from "marked";
import { displayText } from "../runtime/work-log.js";
export const escapeTelegramHTML = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Render our Markdown AST into Telegram's small HTML allowlist. Model HTML is
 * always text. Each page is independently balanced and safely below API limits. */
export function telegramPages(markdown, limit = 3600) {
    if (limit < 256 || limit > 4096)
        throw new Error("Invalid Telegram page limit");
    const parts = [];
    const add = (text, tags = []) => { if (text)
        parts.push({ text, tags }); };
    const tag = (name) => ({ open: `<${name}>`, close: `</${name}>` });
    const walk = (tokens, tags = [], depth = 0) => {
        if (depth > 24) {
            for (const token of tokens)
                add(token.raw, tags);
            return;
        }
        for (const token of tokens) {
            const nested = (name) => walk("tokens" in token ? token.tokens ?? [] : [], name ? [...tags, tag(name)] : tags, depth + 1);
            switch (token.type) {
                case "space": break;
                case "strong":
                    nested("b");
                    break;
                case "em":
                    nested("i");
                    break;
                case "del":
                    nested("s");
                    break;
                case "heading":
                    nested("b");
                    add("\n\n");
                    break;
                case "paragraph":
                    nested();
                    add("\n\n");
                    break;
                case "text":
                    token.tokens ? nested() : add(token.text, tags);
                    break;
                case "escape":
                    add(token.text, tags);
                    break;
                case "codespan":
                    add(token.text, [...tags, tag("code")]);
                    break;
                case "code":
                    add(token.text, [tag("pre")]);
                    add("\n\n");
                    break;
                case "br":
                    add("\n");
                    break;
                case "hr":
                    add("\n");
                    break;
                case "blockquote":
                    nested();
                    break;
                case "link": {
                    let safe = false;
                    try {
                        safe = ["https:", "http:", "mailto:"].includes(new URL(token.href).protocol);
                    }
                    catch { /* literal label */ }
                    const link = { open: `<a href="${escapeTelegramHTML(token.href)}">`, close: "</a>" };
                    walk(token.tokens ?? [], safe && link.open.length < limit / 3 ? [...tags, link] : tags, depth + 1);
                    break;
                }
                case "image":
                    add(`[Bild: ${token.text || "Anhang"}]`, tags);
                    break;
                case "list":
                    token.items.forEach((item, index) => { add(item.task ? item.checked ? "☑ " : "☐ " : token.ordered ? `${Number(token.start) + index}. ` : "• "); walk(item.tokens, tags, depth + 1); add("\n"); });
                    break;
                case "table":
                    for (const row of token.rows) {
                        walk(row[0]?.tokens ?? [], [tag("b")], depth + 1);
                        if (row.length === 2) {
                            add(": ");
                            walk(row[1].tokens, [], depth + 1);
                            add("\n");
                        }
                        else {
                            add("\n");
                            row.slice(1).forEach((cell, i) => { walk(token.header[i + 1]?.tokens ?? [], [], depth + 1); add(": "); walk(cell.tokens, [], depth + 1); add("\n"); });
                            add("\n");
                        }
                    }
                    add("\n");
                    break;
                default: add(token.raw ?? "", tags);
            }
        }
    };
    try {
        walk(marked.lexer(displayText(markdown), { gfm: true }));
    }
    catch {
        parts.length = 0;
        add(displayText(markdown));
    }
    const pages = [];
    let html = "", text = "";
    const flush = () => { if (text.trim())
        pages.push({ html: html.trim(), text: text.trim() }); html = ""; text = ""; };
    for (const part of parts) {
        const tags = [...part.tags];
        while (tags.reduce((size, t) => size + t.open.length + t.close.length, 0) > limit / 2)
            tags.shift();
        const open = tags.map(t => t.open).join(""), close = [...tags].reverse().map(t => t.close).join("");
        let piece = "", plain = "";
        const append = () => { if (piece) {
            html += open + piece + close;
            text += plain;
            piece = "";
            plain = "";
        } };
        for (const char of part.text) {
            const escaped = escapeTelegramHTML(char);
            if (html.length + open.length + piece.length + escaped.length + close.length > limit) {
                append();
                flush();
            }
            piece += escaped;
            plain += char;
        }
        append();
    }
    flush();
    return pages;
}
export function telegramToolLabel(heading) {
    return displayText(heading).replace(/^Failed /, "").replace(/^mcp__.+?__/, "").replace(/__[a-f0-9]{16}(?=\s|$)/g, "")
        .replace(/_/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
}
//# sourceMappingURL=presentation.js.map