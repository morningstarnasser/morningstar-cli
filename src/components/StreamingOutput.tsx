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
