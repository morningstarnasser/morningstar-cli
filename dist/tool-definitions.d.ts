export interface OpenAIToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, unknown>;
            required: string[];
            [key: string]: unknown;
        };
    };
}
export interface AnthropicToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: Record<string, unknown>;
        required: string[];
        [key: string]: unknown;
    };
}
export interface GoogleFunctionDeclaration {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, unknown>;
        required: string[];
        [key: string]: unknown;
    };
}
export declare const TOOL_DEFINITIONS: OpenAIToolDefinition[];
export declare const ANTHROPIC_TOOL_DEFINITIONS: AnthropicToolDefinition[];
export declare const GOOGLE_TOOL_DEFINITIONS: {
    functionDeclarations: GoogleFunctionDeclaration[];
}[];
/** Current core + connected MCP schemas for OpenAI-compatible providers. */
export declare function getOpenAIToolDefinitions(): OpenAIToolDefinition[];
/** Current core + connected MCP schemas for the Anthropic Messages API. */
export declare function getAnthropicToolDefinitions(): AnthropicToolDefinition[];
/** Current core + connected MCP schemas for the Gemini API. */
export declare function getGoogleToolDefinitions(): {
    functionDeclarations: GoogleFunctionDeclaration[];
}[];
//# sourceMappingURL=tool-definitions.d.ts.map