export { getOllamaBaseUrl } from "./runtime/ollama-endpoint.js";
import type { Message, CLIConfig } from "./types.js";
import { type CodexCatalogModel } from "./providers/codex-cli.js";
export interface ToolCallData {
    id: string;
    name: string;
    arguments: string;
}
export interface UsageData {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens?: number;
    cacheHitTokens?: number;
}
export interface StreamToken {
    type: "reasoning" | "content" | "tool_call" | "usage" | "backend_activity";
    activity?: import("./providers/backend-events.js").BackendActivity;
    text: string;
    toolCall?: ToolCallData;
    usage?: UsageData;
}
export interface LLMProvider {
    name: string;
    supportsTools: boolean;
    streamChat(messages: Message[], config: CLIConfig, signal?: AbortSignal, enableTools?: boolean): AsyncGenerator<StreamToken>;
}
export interface ProviderModelMetadata {
    deployment: "local" | "hosted";
    availabilityHint: string;
}
export interface ProviderCatalogEntry {
    name: string;
    models: string[];
    envKey: string;
    modelMetadata?: Record<string, ProviderModelMetadata>;
}
export declare const PROVIDER_NAMES: readonly ["deepseek", "openai", "anthropic", "google", "nvidia", "github-models", "hydra-local", "ollama", "claude-cli", "codex-cli", "groq", "openrouter", "free-models", "opencode"];
export declare function resolveModelSelectionArg(input: string): {
    model: string;
    provider: string;
};
/**
 * Serialize provider-neutral native tool turns into OpenAI-compatible chat
 * messages while retaining every call id.
 */
export declare function serializeOpenAIMessages(messages: Message[]): Array<Record<string, unknown>>;
type AnthropicContentBlock = Record<string, unknown>;
type AnthropicMessage = {
    role: "user" | "assistant";
    content: AnthropicContentBlock[];
};
/** Serialize native turns into Anthropic tool_use/tool_result content blocks. */
export declare function serializeAnthropicMessages(messages: Message[]): AnthropicMessage[];
type GeminiPart = Record<string, unknown>;
type GeminiContent = {
    role: "user" | "model";
    parts: GeminiPart[];
};
/** Serialize native turns into Gemini functionCall/functionResponse parts. */
export declare function serializeGeminiMessages(messages: Message[]): GeminiContent[];
export declare function parseOllamaListOutput(output: string): string[];
/**
 * Convert one Ollama manifest file into the exact model id accepted by the
 * local API. The first path segment is the registry, the last one is the tag.
 *
 * Examples:
 *   registry.ollama.ai/library/qwen3/latest -> qwen3:latest
 *   registry.ollama.ai/acme/model/q4       -> acme/model:q4
 *   hf.co/org/repo/Q4_K_M                  -> hf.co/org/repo:Q4_K_M
 */
export declare function parseOllamaManifestPath(manifestPath: string): string | null;
/** Read installed model names without requiring the Ollama daemon to run. */
export declare function listOllamaManifestModels(modelsRoot?: string): string[];
export declare function isLocalOllamaHost(configuredHost?: string | undefined): boolean;
export declare function mergeOllamaModelSources(liveModels: string[], localManifestModels: string[], configuredHost?: string | undefined): string[];
export declare function listInstalledOllamaModels(): string[];
export declare function refreshInstalledOllamaModels(): string[];
export declare function detectProvider(model: string): string;
export declare function getProviderBaseUrl(provider: string): string;
export declare function getProviderApiKeyEnv(provider: string): string;
export declare function resolveApiKey(provider: string, configKey: string): string;
export declare function resolveModelName(model: string, provider: string): string;
/**
 * Models offered for the Claude subscription: the CLI aliases first, then the
 * full Anthropic catalog. `claude -p --model claude-fable-5` is accepted, so the
 * subscription is not limited to the three aliases — listing only those made
 * `/model` look like it had failed to load anything.
 */
export declare function buildClaudeCliModels(anthropicModels: readonly string[]): string[];
/**
 * Models offered for the ChatGPT subscription: the CLI default first, then the
 * catalog Codex itself keeps on disk. Without that catalog only the default is
 * listed — better one entry that works than invented ids that fail at runtime.
 */
export declare function buildCodexCliModels(catalog: readonly CodexCatalogModel[]): string[];
export declare function listProviders(): ProviderCatalogEntry[];
export declare function getModelDisplayName(model: string): string;
export declare function getProvider(config: CLIConfig): LLMProvider;
//# sourceMappingURL=providers.d.ts.map