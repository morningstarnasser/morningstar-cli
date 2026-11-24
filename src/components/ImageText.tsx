import React from "react";
import { Text } from "ink";
export const IMAGE_FOREGROUND = "#b7a8ff";
export const IMAGE_BACKGROUND = "#252235";
/** Attachment labels keep a distinct color in drafts, queued and sent messages. */
export function ImageText({ text }: { text: string }) {
  return <>{text.split(/(\[Image #\d+\])/g).map((part, i) => /^\[Image #\d+\]$/.test(part)
    ? <Text key={i} bold color={IMAGE_FOREGROUND} backgroundColor={IMAGE_BACKGROUND}>{part}</Text>
    : <Text key={i}>{part}</Text>)}</>;
}
