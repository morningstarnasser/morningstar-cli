import type { Message, CLIConfig } from "../types.js";
export interface UseChatResult {
    streamingText: string;
    streamingReasoning: string;
    isStreaming: boolean;
    startStream: (messages: Message[], config: CLIConfig) => Promise<string>;
    abort: () => void;
}
export declare function useChat(): UseChatResult;
//# sourceMappingURL=useChat.d.ts.map