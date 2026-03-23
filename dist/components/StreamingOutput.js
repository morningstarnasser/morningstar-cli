import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
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
export function StreamingOutput({ text, reasoning, isStreaming, startTime }) {
    const { star, dim } = useTheme();
    const elapsed = Date.now() - startTime;
    // Parse text into blocks
    const blocks = useMemo(() => parseBlocks(text), [text]);
    // Check if text ends with an unclosed code block (still streaming)
    const hasUnclosedCode = useMemo(() => {
        const openCount = (text.match(/```/g) || []).length;
        return openCount % 2 !== 0;
    }, [text]);
    return (_jsxs(Box, { flexDirection: "column", children: [reasoning && (_jsx(PlanBox, { reasoning: reasoning, elapsed: elapsed })), text && (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsx(Box, { children: _jsx(Text, { color: dim, children: "  \u23BF " }) }), blocks.map((block, i) => {
                        if (block.type === "code") {
                            return _jsx(CodeBlock, { code: block.content.replace(/\n$/, ""), lang: block.lang }, i);
                        }
                        return (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { wrap: "wrap", children: block.content }) }, i));
                    }), isStreaming && hasUnclosedCode && (_jsx(Box, { marginLeft: 4, children: _jsx(Text, { color: dim, children: "\u258C" }) }))] }))] }));
}
//# sourceMappingURL=StreamingOutput.js.map