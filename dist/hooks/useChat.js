import { useState, useRef, useCallback } from "react";
import { streamChat } from "../ai.js";
export function useChat() {
    const [streamingText, setStreamingText] = useState("");
    const [streamingReasoning, setStreamingReasoning] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const abortRef = useRef(null);
    const abort = useCallback(() => {
        abortRef.current?.abort();
    }, []);
    const startStream = useCallback(async (messages, config) => {
        setStreamingText("");
        setStreamingReasoning("");
        setIsStreaming(true);
        abortRef.current = new AbortController();
        const signal = abortRef.current.signal;
        let full = "";
        try {
            for await (const token of streamChat(messages, config, signal)) {
                if (signal.aborted)
                    break;
                if (token.type === "reasoning") {
                    setStreamingReasoning((prev) => prev + token.text);
                }
                else {
                    full += token.text;
                    setStreamingText((prev) => prev + token.text);
                }
            }
        }
        finally {
            setIsStreaming(false);
            abortRef.current = null;
        }
        return full;
    }, []);
    return { streamingText, streamingReasoning, isStreaming, startStream, abort };
}
//# sourceMappingURL=useChat.js.map