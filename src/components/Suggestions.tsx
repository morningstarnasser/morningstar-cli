import React from "react";
import { Box, Text } from "ink";

interface SuggestionsProps {
  items: Array<{ cmd: string; desc: string }>;
  selectedIndex: number;
  visible: boolean;
}

export function Suggestions({ items, selectedIndex, visible }: SuggestionsProps) {
  if (!visible || items.length === 0) return null;

  const maxShow = Math.min(items.length, 8);
  const visibleItems = items.slice(0, maxShow);

  return (
    <Box flexDirection="column" marginLeft={2}>
      {visibleItems.map((item, i) => (
        <Box key={item.cmd}>
          {i === selectedIndex ? (
            <Text backgroundColor="#3b3b3b">
              <Text color="#22d3ee" bold>  {item.cmd}</Text>
              <Text color="#6b7280"> {item.desc}</Text>
            </Text>
          ) : (
            <Text>
              <Text color="#6b7280">  {item.cmd}</Text>
              <Text color="#4b5563"> {item.desc}</Text>
            </Text>
          )}
        </Box>
      ))}
      {items.length > maxShow && (
        <Text color="#4b5563">  ... +{items.length - maxShow} weitere</Text>
      )}
    </Box>
  );
}
