import type { Message } from "../types.js";
import type { StreamToken } from "../providers.js";
export interface CodexCatalogModel {
    slug: string;
    displayName: string;
    description: string;
}
/** Path of the catalog Codex maintains. `CODEX_HOME` wins when set. */
export declare function codexCatalogPath(): string;
/**
 * Parse the catalog file.
 *
 * Entries marked `visibility: "hide"` are internal (e.g. `codex-auto-review`,
 * the approval reviewer) and must not be offered as chat models. `priority`
 * carries the vendor's own ordering, lowest first.
 */
export declare function parseCodexCatalog(raw: string): CodexCatalogModel[];
/** Cached catalog; empty when Codex is not installed or never fetched one. */
export declare function listCodexModels(): CodexCatalogModel[];
/** Drop the cache so the next read picks up a newer catalog. */
export declare function refreshCodexModels(): void;
/** Vendor display name for a slug, or the slug itself when unknown. */
export declare function getCodexModelDisplayName(slug: string): string;
/**
 * Base argv for a non-interactive, read-only Codex run.
 *
 * `--ignore-user-config` avoids inheriting user configuration defaults.
 * Codex can still have tools supplied by its runtime. Their public events are
 * forwarded as observations; this flag is not a tool-isolation guarantee.
 */
export declare const CODEX_BASE_ARGS: string[];
/** Build the prompt sent to `codex exec` over stdin. */
export declare function buildCodexPrompt(messages: Message[]): string;
/** Build the `codex exec` argv for a text-only brain call. */
export declare function buildCodexArgs(model?: string, imagePaths?: string[]): string[];
/**
 * Extract assistant text from one line of Codex's JSONL event stream.
 *
 * Codex emits `item.completed` events; only `agent_message` items carry the
 * reply. Reasoning, command executions and Codex's own errors are ignored so a
 * failing MCP server never leaks into the model output.
 */
export declare function parseCodexEvent(line: string): string | null;
/** Streams stdout chunks of a `codex` invocation. Injectable for tests. */
export type CodexRunner = (args: string[], prompt: string, signal?: AbortSignal) => AsyncIterable<string>;
/** Stream a model response by driving the local `codex` CLI as a text brain. */
export declare function codexCliStream(model: string | undefined, messages: Message[], signal?: AbortSignal, runner?: CodexRunner): AsyncGenerator<StreamToken>;
//# sourceMappingURL=codex-cli.d.ts.map