import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useReducer } from "react";
function appReducer(state, action) {
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
const AppContext = createContext(null);
export function AppProvider({ children, initialConfig, initialCtx, initialSystemPrompt, chatOnly, skipPermissions, }) {
    const initialState = {
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
    return (_jsx(AppContext.Provider, { value: { state, dispatch }, children: children }));
}
export function useAppState() {
    const ctx = useContext(AppContext);
    if (!ctx)
        throw new Error("useAppState must be used within AppProvider");
    return ctx;
}
//# sourceMappingURL=AppContext.js.map