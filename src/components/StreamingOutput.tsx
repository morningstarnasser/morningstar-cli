import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { CodeBlock } from "./CodeBlock.js";
import { PlanBox } from "./PlanBox.js";

interface StreamingOutputProps {
  text: string;
  reasoning: string;
  isStreaming: boolean;
  startTime: number;
}

interface ParsedBlock {
  type: "text" | "code";
  content: string;
  lang?: string;
}

function parseBlocks(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];

  // First strip <tool:write> blocks — show compact summary instead of full code
  let cleaned = text.replace(/<tool:write>([^\n]+)\n([\s\S]*?)<\/tool(?::write)?>/g, (_m, path, content) => {
    const lineCount = content.split("\n").length;
    return `\n✦ Writing ${(path as string).trim()} (${lineCount} lines)\n`;
  });
  // Also collapse unclosed <tool:write> blocks (still streaming)
  cleaned = cleaned.replace(/<tool:write>([^\n]+)\n([\s\S]{200,})$/g, (_m, path, content) => {
    const lineCount = content.split("\n").length;
    return `\n✦ Writing ${(path as string).trim()} (${lineCount} lines so far...)\n`;
  });
  // Collapse <tool:edit> blocks too
  cleaned = cleaned.replace(/<tool:edit>([\s\S]*?)<\/tool(?::edit)?>/g, (_m, content) => {
    const pathMatch = (content as string).match(/^([^\n]+)/);
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
    } else {
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

export function StreamingOutput({ text, reasoning, isStreaming, startTime }: StreamingOutputProps) {
  const { star, dim } = useTheme();

  const elapsed = Date.now() - startTime;

  // Parse text into blocks
  const blocks = useMemo(() => parseBlocks(text), [text]);

  // Check if text ends with an unclosed code block (still streaming)
  const hasUnclosedCode = useMemo(() => {
    const openCount = (text.match(/```/g) || []).length;
    return openCount % 2 !== 0;
  }, [text]);

  return (
    <Box flexDirection="column">
      {/* Reasoning/Plan box */}
      {reasoning && (
        <PlanBox reasoning={reasoning} elapsed={elapsed} />
      )}

      {/* Content */}
      {text && (
        <Box flexDirection="column" marginLeft={2}>
          <Box>
            <Text color={dim}>  ⎿ </Text>
          </Box>
          {blocks.map((block, i) => {
            if (block.type === "code") {
              return <CodeBlock key={i} code={block.content.replace(/\n$/, "")} lang={block.lang} />;
            }
            return (
              <Box key={i} marginLeft={2}>
                <Text wrap="wrap">{block.content}</Text>
              </Box>
            );
          })}
          {/* Show cursor while streaming unclosed code */}
          {isStreaming && hasUnclosedCode && (
            <Box marginLeft={4}>
              <Text color={dim}>▌</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
