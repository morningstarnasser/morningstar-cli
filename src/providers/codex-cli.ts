import { vendorCommand } from "../runtime/platform-process.js";
import { conversationImages } from "../runtime/images.js";
// ─── Codex CLI Provider ──────────────────────────────────────────────────────
// Use the locally-installed `codex` CLI (OpenAI Codex, ChatGPT subscription
// OAuth — no API key, no per-token cost) as Morningstar's model backend.
//
// Provider-runtime tool events are observations; Morningstar never executes them twice.
// The Codex sandbox remains read-only. Its public work events are shown in the UI.

import { parseBackendEvent } from "./backend-events.js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message } from "../types.js";
import type { StreamToken } from "../providers.js";

// ─── Model catalog ───────────────────────────────────────────────────────────
// Codex keeps the model list the server sent it in ~/.codex/models_cache.json,
// refreshed by the CLI itself. Reading that file gives real slugs and real
// display names instead of guesses — and it stays current without our help.

export interface CodexCatalogModel {
  slug: string;
  displayName: string;
  description: string;
}

/** Path of the catalog Codex maintains. `CODEX_HOME` wins when set. */
export function codexCatalogPath(): string {
  const home = process.env.CODEX_HOME?.trim();
  return home ? join(home, "models_cache.json") : join(homedir(), ".codex", "models_cache.json");
}

/**
 * Parse the catalog file.
 *
 * Entries marked `visibility: "hide"` are internal (e.g. `codex-auto-review`,
 * the approval reviewer) and must not be offered as chat models. `priority`
 * carries the vendor's own ordering, lowest first.
 */
export function parseCodexCatalog(raw: string): CodexCatalogModel[] {
  try {
    const parsed = JSON.parse(raw) as { models?: unknown };
    if (!Array.isArray(parsed.models)) return [];
    return parsed.models
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object")
      .filter((entry) => typeof entry.slug === "string" && entry.slug.length > 0)
      .filter((entry) => entry.visibility !== "hide")
      .sort((left, right) =>
        (typeof left.priority === "number" ? left.priority : Number.MAX_SAFE_INTEGER)
        - (typeof right.priority === "number" ? right.priority : Number.MAX_SAFE_INTEGER))
      .map((entry) => ({
        slug: entry.slug as string,
        displayName: typeof entry.display_name === "string" && entry.display_name
          ? entry.display_name
          : (entry.slug as string),
        description: typeof entry.description === "string" ? entry.description : "",
      }));
  } catch {
    return [];
  }
}

let catalogCache: CodexCatalogModel[] | null = null;

/** Cached catalog; empty when Codex is not installed or never fetched one. */
export function listCodexModels(): CodexCatalogModel[] {
  if (catalogCache) return catalogCache;
  const path = codexCatalogPath();
  try {
    catalogCache = existsSync(path) ? parseCodexCatalog(readFileSync(path, "utf-8")) : [];
  } catch {
    catalogCache = [];
  }
  return catalogCache;
}

/** Drop the cache so the next read picks up a newer catalog. */
export function refreshCodexModels(): void {
  catalogCache = null;
}

/** Vendor display name for a slug, or the slug itself when unknown. */
export function getCodexModelDisplayName(slug: string): string {
  return listCodexModels().find((model) => model.slug === slug)?.displayName ?? slug;
}

/**
 * Base argv for a non-interactive, read-only Codex run.
 *
 * `--ignore-user-config` avoids inheriting user configuration defaults.
 * Codex can still have tools supplied by its runtime. Their public events are
 * forwarded as observations; this flag is not a tool-isolation guarantee.
 */
export const CODEX_BASE_ARGS = [
  "exec",
  "--json",
  "--sandbox",
  "read-only",
  "--skip-git-repo-check",
  "--ephemeral",
  "--ignore-user-config",
  "--color",
  "never",
];

/** Build the prompt sent to `codex exec` over stdin. */
export function buildCodexPrompt(messages: Message[]): string {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const convo = messages.filter((message) => message.role !== "system");
  const transcript = convo.length === 1 && convo[0].role === "user"
    ? convo[0].content
    : convo
      .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
      .join("\n\n");
  // Codex exec has no --system-prompt flag, so the system prompt is prepended
  // as an instruction block instead.
  return system ? `${system}\n\n---\n\n${transcript}` : transcript;
}

/** Build the `codex exec` argv for a text-only brain call. */
export function buildCodexArgs(model?: string, imagePaths: string[] = []): string[] {
  const args = [...CODEX_BASE_ARGS];
  if (model) args.push("--model", model);
  for (const path of imagePaths) args.push("--image", path);
  return args;
}

/**
 * Extract assistant text from one line of Codex's JSONL event stream.
 *
 * Codex emits `item.completed` events; only `agent_message` items carry the
 * reply. Reasoning, command executions and Codex's own errors are ignored so a
 * failing MCP server never leaks into the model output.
 */
export function parseCodexEvent(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const event = JSON.parse(trimmed) as {
      type?: string;
      item?: { type?: string; text?: string };
    };
    if (event.type !== "item.completed") return null;
    if (event.item?.type !== "agent_message") return null;
    return event.item.text ?? null;
  } catch {
    return null;
  }
}

/** Streams stdout chunks of a `codex` invocation. Injectable for tests. */
export type CodexRunner = (
  args: string[],
  prompt: string,
  signal?: AbortSignal,
) => AsyncIterable<string>;

const defaultRunner: CodexRunner = async function* (args, prompt, signal) {
  const executable = vendorCommand("codex", args);
  const child = spawn(executable.file, executable.args, { stdio: ["pipe", "pipe", "pipe"], signal });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  // Without an "error" listener a failed spawn — or an abort delivered through
  // the signal — becomes an uncaught exception on the child process.
  const closed = new Promise<number>((resolvePromise, rejectPromise) => {
    child.on("close", (code) => resolvePromise(code ?? 0));
    child.on("error", (error) => {
      if ((error as { name?: string }).name === "AbortError") resolvePromise(0);
      else rejectPromise(error);
    });
  });

  child.stdin?.write(prompt);
  child.stdin?.end();

  try {
    for await (const chunk of child.stdout!) {
      yield (chunk as Buffer).toString();
    }
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") return;
    throw error;
  }

  const code = await closed;
  if (code !== 0) {
    throw new Error(`codex CLI exited ${code}: ${stderr.slice(0, 300) || "no stderr"}`);
  }
};

/** Stream a model response by driving the local `codex` CLI as a text brain. */
export async function* codexCliStream(
  model: string | undefined,
  messages: Message[],
  signal?: AbortSignal,
  runner: CodexRunner = defaultRunner,
): AsyncGenerator<StreamToken> {
  const images = conversationImages(messages);
  const prompt = buildCodexPrompt(messages) + (images.length ? `\n\nAttached images in order: ${images.map(i => `[Image #${i.id}]`).join(", ")}.` : "");
  const args = buildCodexArgs(model, images.map(i => i.path));
  let buffer = "";
  let hasText = false;
  const completed = new Set<string>();
  function parse(line: string): StreamToken | null {
    const token = parseBackendEvent(line);
    if (!token) return null;
    if (token.type === "content" && token.text) { token.text = (hasText ? "\n\n" : "") + token.text; hasText = true; }
    if (token.activity?.result) {
      if (completed.has(token.activity.id)) return null;
      completed.add(token.activity.id);
    }
    return token;
  }

  for await (const chunk of runner(args, prompt, signal)) {
    if (signal?.aborted) return;
    buffer += chunk;
    const lines = buffer.split("\n");
    // The trailing element is an incomplete line; keep it for the next chunk.
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const token = parse(line);
      if (token) yield token;
    }
  }

  const tail = parse(buffer);
  if (tail && !signal?.aborted) yield tail;
}
