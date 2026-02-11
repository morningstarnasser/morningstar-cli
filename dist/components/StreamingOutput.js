import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { CodeBlock } from "./CodeBlock.js";
import { PlanBox } from "./PlanBox.js";
function parseBlocks(text) {
    const blocks = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIdx = 0;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        // Text before code block
        const before = text.slice(lastIdx, match.index);
        if (before.trim()) {
            blocks.push({ type: "text", content: before });
        }
        // Code block
        blocks.push({ type: "code", content: match[2], lang: match[1] || undefined });
        lastIdx = match.index + match[0].length;
    }
    // Remaining text after last code block
    const remaining = text.slice(lastIdx);
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
    return (_jsxs(Box, { flexDirection: "column", children: [reasoning && (_jsx(PlanBox, { reasoning: reasoning, elapsed: elapsed })), text && (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsx(Box, { children: _jsx(Text, { color: star, children: "  * " }) }), blocks.map((block, i) => {
                        if (block.type === "code") {
                            return _jsx(CodeBlock, { code: block.content.replace(/\n$/, ""), lang: block.lang }, i);
                        }
                        return (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { wrap: "wrap", children: block.content }) }, i));
                    }), isStreaming && hasUnclosedCode && (_jsx(Box, { marginLeft: 4, children: _jsx(Text, { color: dim, children: "\u258C" }) }))] }))] }));
}
//# sourceMappingURL=StreamingOutput.js.map