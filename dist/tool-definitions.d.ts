export interface OpenAIToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, {
                type: string;
                description: string;
            }>;
            required: string[];
        };
    };
}
export interface AnthropicToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: Record<string, {
            type: string;
            description: string;
        }>;
        required: string[];
    };
}
export interface GoogleFunctionDeclaration {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, {
            type: string;
            description: string;
        }>;
        required: string[];
    };
}
export declare const TOOL_DEFINITIONS: OpenAIToolDefinition[];
export declare const ANTHROPIC_TOOL_DEFINITIONS: AnthropicToolDefinition[];
export declare const GOOGLE_TOOL_DEFINITIONS: {
    functionDeclarations: GoogleFunctionDeclaration[];
}[];
//# sourceMappingURL=tool-definitions.d.ts.map