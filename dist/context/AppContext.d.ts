import React, { type ReactNode } from "react";
import type { Message, CLIConfig, ProjectContext } from "../types.js";
export interface AppState {
    config: CLIConfig;
    ctx: ProjectContext;
    messages: Message[];
    totalTokensEstimate: number;
    activeAgent: string | null;
    isProcessing: boolean;
    planMode: boolean;
    thinkMode: boolean;
    chatOnly: boolean;
    skipPermissions: boolean;
    currentOutput: OutputBlock[];
    showBanner: boolean;
    showHelp: boolean;
    showFeatures: boolean;
    inputValue: string;
    streamingText: string;
    streamingReasoning: string;
    isStreaming: boolean;
    spinnerText: string;
    toolResults: ToolResultDisplay[];
    errorMessage: string | null;
    infoMessage: string | null;
}
export interface OutputBlock {
    id: string;
    type: "text" | "code" | "plan" | "tool" | "info" | "error" | "banner";
    content: string;
    lang?: string;
    toolName?: string;
    success?: boolean;
    diff?: {
        filePath: string;
        oldStr: string;
        newStr: string;
    };
    elapsed?: number;
}
export interface ToolResultDisplay {
    tool: string;
    result: string;
    success: boolean;
    diff?: {
        filePath: string;
        oldStr: string;
        newStr: string;
    };
}
type AppAction = {
    type: "SET_PROCESSING";
    payload: boolean;
} | {
    type: "SET_STREAMING";
    payload: boolean;
} | {
    type: "SET_STREAMING_TEXT";
    payload: string;
} | {
    type: "APPEND_STREAMING_TEXT";
    payload: string;
} | {
    type: "SET_STREAMING_REASONING";
    payload: string;
} | {
    type: "APPEND_STREAMING_REASONING";
    payload: string;
} | {
    type: "SET_SPINNER_TEXT";
    payload: string;
} | {
    type: "ADD_MESSAGE";
    payload: Message;
} | {
    type: "SET_MESSAGES";
    payload: Message[];
} | {
    type: "CLEAR_MESSAGES";
    payload: Message;
} | {
    type: "SET_ACTIVE_AGENT";
    payload: string | null;
} | {
    type: "TOGGLE_PLAN_MODE";
} | {
    type: "TOGGLE_THINK_MODE";
} | {
    type: "SET_INPUT_VALUE";
    payload: string;
} | {
    type: "ADD_OUTPUT_BLOCK";
    payload: OutputBlock;
} | {
    type: "CLEAR_OUTPUT";
} | {
    type: "ADD_TOOL_RESULT";
    payload: ToolResultDisplay;
} | {
    type: "CLEAR_TOOL_RESULTS";
} | {
    type: "SET_ERROR";
    payload: string | null;
} | {
    type: "SET_INFO";
    payload: string | null;
} | {
    type: "SET_SHOW_HELP";
    payload: boolean;
} | {
    type: "SET_SHOW_FEATURES";
    payload: boolean;
} | {
    type: "SET_SHOW_BANNER";
    payload: boolean;
} | {
    type: "UPDATE_CONFIG";
    payload: Partial<CLIConfig>;
} | {
    type: "SET_TOKENS_ESTIMATE";
    payload: number;
} | {
    type: "ADD_TOKENS_ESTIMATE";
    payload: number;
};
export declare function AppProvider({ children, initialConfig, initialCtx, initialSystemPrompt, chatOnly, skipPermissions, }: {
    children: ReactNode;
    initialConfig: CLIConfig;
    initialCtx: ProjectContext;
    initialSystemPrompt: string;
    chatOnly: boolean;
    skipPermissions: boolean;
}): import("react/jsx-runtime").JSX.Element;
export declare function useAppState(): {
    state: AppState;
    dispatch: React.Dispatch<AppAction>;
};
export {};
//# sourceMappingURL=AppContext.d.ts.map