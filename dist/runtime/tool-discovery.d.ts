import type { OpenAIToolDefinition } from "../tool-definitions.js";
import type { Message } from "../types.js";
/** Retrieval ranks discovery only. Execution always keeps the normal tool policy. */
export declare function rankTools<T extends {
    name: string;
    description: string;
}>(tools: T[], query: string): T[];
/** Large MCP registries are discovered on demand. Do not duplicate every schema
 * on every turn of a small-context local model. All selected schemas stay exact. */
export declare function selectRequestTools(tools: OpenAIToolDefinition[], messages: Message[]): OpenAIToolDefinition[];
//# sourceMappingURL=tool-discovery.d.ts.map