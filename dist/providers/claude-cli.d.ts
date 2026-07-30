import type { Message } from "../types.js";
import type { StreamToken } from "../providers.js";
/** Claude Code's native tools, disabled so it acts as a plain text model. */
export declare const DISABLED_CLAUDE_CODE_TOOLS: string[];
/** Build the system prompt (arg) and the conversation prompt (stdin) from messages. */
export declare function buildClaudePrompt(messages: Message[]): {
    system: string;
    prompt: string;
};
/** Build the `claude` CLI argv for a print-mode, tool-free brain call. */
export declare function buildClaudeArgs(modelAlias: string | undefined, system: string): string[];
/** Streams stdout chunks of a `claude` invocation. Injectable for tests. */
export type ClaudeRunner = (args: string[], prompt: string, signal?: AbortSignal) => AsyncIterable<string>;
/** Stream a model response by driving the local `claude` CLI as a text brain. */
export declare function claudeCliStream(modelAlias: string | undefined, messages: Message[], signal?: AbortSignal, runner?: ClaudeRunner): AsyncGenerator<StreamToken>;
//# sourceMappingURL=claude-cli.d.ts.map