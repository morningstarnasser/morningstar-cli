import React from "react";
import { Box, Text } from "ink";

interface ContextRadarProps {
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function countCodeTokens(content: string): number {
  const codeBlockRegex = /```[\s\S]*?```/g;
  const matches = content.match(codeBlockRegex);
  if (!matches) return 0;
  return matches.reduce((sum, block) => sum + estimateTokens(block), 0);
}

export function ContextRadar({ messages, maxTokens = 128000 }: ContextRadarProps) {
  let systemTokens = 0;
  let chatTokens = 0;
  let codeTokens = 0;
  let toolTokens = 0;

  for (const msg of messages) {
    const content = msg.content || "";
    const tokens = estimateTokens(content);

    if (content.includes("[Tool:")) {
      toolTokens += tokens;
    } else if (msg.role === "system") {
      systemTokens += tokens;
    } else if (msg.role === "user") {
      chatTokens += tokens;
    } else if (msg.role === "assistant") {
      const codeInMsg = countCodeTokens(content);
      codeTokens += codeInMsg;
      chatTokens += Math.max(0, tokens - codeInMsg);
    }
  }

  const usedTokens = systemTokens + chatTokens + codeTokens + toolTokens;
  const usagePct = Math.min(100, Math.round((usedTokens / maxTokens) * 100));

  const sysPct = Math.round((systemTokens / maxTokens) * 100);
  const chatPct = Math.round((chatTokens / maxTokens) * 100);
  const codePct = Math.round((codeTokens / maxTokens) * 100);
  const toolPct = Math.round((toolTokens / maxTokens) * 100);
  const freePct = Math.max(0, 100 - sysPct - chatPct - codePct - toolPct);

  // Bar: 20 chars wide
  const barWidth = 20;
  const filled = Math.round((usagePct / 100) * barWidth);
  const empty = barWidth - filled;
  const filledBar = "\u2588".repeat(filled);
  const emptyBar = "\u2591".repeat(empty);

  // Color by usage level
  const barColor = usagePct < 60 ? "#34d399" : usagePct < 80 ? "#fbbf24" : usagePct < 95 ? "#fb923c" : "#f87171";
  const warn = usagePct >= 85;

  return (
    <Box>
      <Text color="gray">{"\u25D0 "}</Text>
      <Text color="white" bold>Context </Text>
      <Text color="gray">[</Text>
      <Text color={barColor}>{filledBar}</Text>
      <Text color="gray">{emptyBar}] </Text>
      <Text color={barColor} bold>{usagePct}%</Text>
      {warn && <Text color="#f87171">{" \u26A0"}</Text>}
      <Text color="gray">{" \u00B7 "}</Text>
      <Text color="gray">Sys {sysPct}%</Text>
      <Text color="gray">{" \u00B7 "}</Text>
      <Text color="#60a5fa">Chat {chatPct}%</Text>
      <Text color="gray">{" \u00B7 "}</Text>
      <Text color="#34d399">Code {codePct}%</Text>
      <Text color="gray">{" \u00B7 "}</Text>
      <Text color="#fbbf24">Tools {toolPct}%</Text>
      <Text color="gray">{" \u00B7 "}</Text>
      <Text color="gray" dimColor>Free {freePct}%</Text>
    </Box>
  );
}
