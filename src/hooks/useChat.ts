import { useState, useRef, useCallback } from "react";
import { streamChat } from "../ai.js";
import type { Message, CLIConfig } from "../types.js";
import type { StreamToken } from "../ai.js";

export interface UseChatResult {
  streamingText: string;
  streamingReasoning: string;
  isStreaming: boolean;
  startStream: (messages: Message[], config: CLIConfig) => Promise<string>;
  abort: () => void;
}

export function useChat(): UseChatResult {
  const [streamingText, setStreamingText] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startStream = useCallback(async (messages: Message[], config: CLIConfig): Promise<string> => {
    setStreamingText("");
    setStreamingReasoning("");
    setIsStreaming(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    let full = "";
    try {
      for await (const token of streamChat(messages, config, signal)) {
        if (signal.aborted) break;
        if (token.type === "reasoning") {
          setStreamingReasoning((prev) => prev + token.text);
        } else {
          full += token.text;
          setStreamingText((prev) => prev + token.text);
        }
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
    return full;
  }, []);

  return { streamingText, streamingReasoning, isStreaming, startStream, abort };
}
