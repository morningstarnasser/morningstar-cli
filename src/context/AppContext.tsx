import React, { createContext, useContext, useReducer, type ReactNode } from "react";
import type { Message, CLIConfig, ProjectContext } from "../types.js";
import { getTheme, type Theme } from "../theme.js";

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
  // UI State
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
  diff?: { filePath: string; oldStr: string; newStr: string };
  elapsed?: number;
}

export interface ToolResultDisplay {
  tool: string;
  result: string;
  success: boolean;
  diff?: { filePath: string; oldStr: string; newStr: string };
}

type AppAction =
  | { type: "SET_PROCESSING"; payload: boolean }
  | { type: "SET_STREAMING"; payload: boolean }
  | { type: "SET_STREAMING_TEXT"; payload: string }
  | { type: "APPEND_STREAMING_TEXT"; payload: string }
  | { type: "SET_STREAMING_REASONING"; payload: string }
  | { type: "APPEND_STREAMING_REASONING"; payload: string }
  | { type: "SET_SPINNER_TEXT"; payload: string }
  | { type: "ADD_MESSAGE"; payload: Message }
  | { type: "SET_MESSAGES"; payload: Message[] }
  | { type: "CLEAR_MESSAGES"; payload: Message }
  | { type: "SET_ACTIVE_AGENT"; payload: string | null }
  | { type: "TOGGLE_PLAN_MODE" }
  | { type: "TOGGLE_THINK_MODE" }
  | { type: "SET_INPUT_VALUE"; payload: string }
  | { type: "ADD_OUTPUT_BLOCK"; payload: OutputBlock }
  | { type: "CLEAR_OUTPUT" }
  | { type: "ADD_TOOL_RESULT"; payload: ToolResultDisplay }
  | { type: "CLEAR_TOOL_RESULTS" }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_INFO"; payload: string | null }
  | { type: "SET_SHOW_HELP"; payload: boolean }
  | { type: "SET_SHOW_FEATURES"; payload: boolean }
  | { type: "SET_SHOW_BANNER"; payload: boolean }
  | { type: "UPDATE_CONFIG"; payload: Partial<CLIConfig> }
  | { type: "SET_TOKENS_ESTIMATE"; payload: number }
  | { type: "ADD_TOKENS_ESTIMATE"; payload: number };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_PROCESSING":
      return { ...state, isProcessing: action.payload };
    case "SET_STREAMING":
      return { ...state, isStreaming: action.payload };
    case "SET_STREAMING_TEXT":
      return { ...state, streamingText: action.payload };
    case "APPEND_STREAMING_TEXT":
      return { ...state, streamingText: state.streamingText + action.payload };
    case "SET_STREAMING_REASONING":
      return { ...state, streamingReasoning: action.payload };
    case "APPEND_STREAMING_REASONING":
      return { ...state, streamingReasoning: state.streamingReasoning + action.payload };
    case "SET_SPINNER_TEXT":
      return { ...state, spinnerText: action.payload };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "SET_MESSAGES":
      return { ...state, messages: action.payload };
    case "CLEAR_MESSAGES":
      return { ...state, messages: [action.payload], totalTokensEstimate: 0 };
    case "SET_ACTIVE_AGENT":
      return { ...state, activeAgent: action.payload };
    case "TOGGLE_PLAN_MODE":
      return { ...state, planMode: !state.planMode };
    case "TOGGLE_THINK_MODE":
      return { ...state, thinkMode: !state.thinkMode };
    case "SET_INPUT_VALUE":
      return { ...state, inputValue: action.payload };
    case "ADD_OUTPUT_BLOCK":
      return { ...state, currentOutput: [...state.currentOutput, action.payload] };
    case "CLEAR_OUTPUT":
      return { ...state, currentOutput: [], toolResults: [], streamingText: "", streamingReasoning: "" };
    case "ADD_TOOL_RESULT":
      return { ...state, toolResults: [...state.toolResults, action.payload] };
    case "CLEAR_TOOL_RESULTS":
      return { ...state, toolResults: [] };
    case "SET_ERROR":
      return { ...state, errorMessage: action.payload };
    case "SET_INFO":
      return { ...state, infoMessage: action.payload };
    case "SET_SHOW_HELP":
      return { ...state, showHelp: action.payload };
    case "SET_SHOW_FEATURES":
      return { ...state, showFeatures: action.payload };
    case "SET_SHOW_BANNER":
      return { ...state, showBanner: action.payload };
    case "UPDATE_CONFIG":
      return { ...state, config: { ...state.config, ...action.payload } };
    case "SET_TOKENS_ESTIMATE":
      return { ...state, totalTokensEstimate: action.payload };
    case "ADD_TOKENS_ESTIMATE":
      return { ...state, totalTokensEstimate: state.totalTokensEstimate + action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export function AppProvider({
  children,
  initialConfig,
  initialCtx,
  initialSystemPrompt,
  chatOnly,
  skipPermissions,
}: {
  children: ReactNode;
  initialConfig: CLIConfig;
  initialCtx: ProjectContext;
  initialSystemPrompt: string;
  chatOnly: boolean;
  skipPermissions: boolean;
}) {
  const initialState: AppState = {
    config: initialConfig,
    ctx: initialCtx,
    messages: [{ role: "system", content: initialSystemPrompt }],
    totalTokensEstimate: 0,
    activeAgent: null,
    isProcessing: false,
    planMode: false,
    thinkMode: false,
    chatOnly,
    skipPermissions,
    currentOutput: [],
    showBanner: true,
    showHelp: false,
    showFeatures: false,
    inputValue: "",
    streamingText: "",
    streamingReasoning: "",
    isStreaming: false,
    spinnerText: "",
    toolResults: [],
    errorMessage: null,
    infoMessage: null,
  };

  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}
