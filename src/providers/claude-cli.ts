import { vendorCommand } from "../runtime/platform-process.js";
// ─── Claude CLI Provider ─────────────────────────────────────────────────────
// Use the locally-installed `claude` CLI (Claude Code, subscription OAuth — no
// API key, no per-token cost) as Carry's model backend. We run it in print mode
// as a pure text brain: Claude Code's OWN tools are disabled, so it never runs
// its agent loop — it just returns text, including Carry's own `<tool:...>`
// protocol tags, which Carry's loop then parses and executes.
//
// Additive: a new provider plugged into the registry; existing providers are
// untouched. The runner is injectable so tests never spawn a real process.

import { spawn } from "node:child_process";
import type { Message } from "../types.js";
import type { StreamToken } from "../providers.js";
import { conversationImages, imageData } from "../runtime/images.js";

/** Claude Code's native tools, disabled so it acts as a plain text model. */
export const DISABLED_CLAUDE_CODE_TOOLS = [
  "Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch",
  "Task", "TodoWrite", "NotebookEdit", "BashOutput", "KillShell",
];

/** Build the system prompt (arg) and the conversation prompt (stdin) from messages. */
export function buildClaudePrompt(messages: Message[]): { system: string; prompt: string } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const convo = messages.filter((m) => m.role !== "system");
  if (convo.length === 1 && convo[0].role === "user") {
    return { system, prompt: convo[0].content };
  }
  const prompt = convo
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  return { system, prompt };
}

/** Build the `claude` CLI argv for a print-mode, tool-free brain call. */
export function buildClaudeArgs(modelAlias: string | undefined, system: string, images = false): string[] {
  const args = ["-p", "--output-format", images ? "stream-json" : "text"];
  if (images) args.push("--input-format", "stream-json", "--verbose", "--include-partial-messages");
  if (modelAlias) args.push("--model", modelAlias);
  if (system) args.push("--system-prompt", system);
  // Empty tools is the vendor's tool-free print mode. An expanding deny list
  // misses newly introduced tools and breaks Windows shell initialization.
  args.push("--tools", "", "--disallowedTools", "mcp__*");
  return args;
}

/** Streams stdout chunks of a `claude` invocation. Injectable for tests. */
export type ClaudeRunner = (args: string[], prompt: string, signal?: AbortSignal) => AsyncIterable<string>;

const defaultRunner: ClaudeRunner = async function* (args, prompt, signal) {
  const executable = vendorCommand("claude", args);
  const child = spawn(executable.file, executable.args, { stdio: ["pipe", "pipe", "pipe"], signal });
  let stderr = "";
  child.stderr?.on("data", (d: Buffer) => {
    stderr += d.toString();
  });
  // Without an "error" listener a failed spawn — or an abort delivered through
  // the signal — becomes an uncaught exception on the child process.
  const closed = new Promise<number>((resolve, reject) => {
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", (error) => {
      if ((error as { name?: string }).name === "AbortError") resolve(0);
      else reject(error);
    });
  });

  child.stdin?.write(prompt);
  child.stdin?.end();

  try {
    for await (const chunk of child.stdout!) {
      yield (chunk as Buffer).toString();
    }
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") return;
    throw err;
  }

  const code = await closed;
  if (code !== 0) {
    throw new Error(`claude CLI exited ${code}: ${stderr.slice(0, 300) || "no stderr"}`);
  }
};

/** Stream a model response by driving the local `claude` CLI as a text brain. */
export async function* claudeCliStream(
  modelAlias: string | undefined,
  messages: Message[],
  signal?: AbortSignal,
  runner: ClaudeRunner = defaultRunner,
): AsyncGenerator<StreamToken> {
  const { system, prompt } = buildClaudePrompt(messages);
  const images = conversationImages(messages);
  const args = buildClaudeArgs(modelAlias, system, images.length > 0);
  const input = images.length ? JSON.stringify({ type: "user", parent_tool_use_id: null, message: { role: "user", content: [
    { type: "text", text: prompt },
    ...images.flatMap(image => [
      { type: "text", text: `[Image #${image.id}]` },
      { type: "image", source: { type: "base64", media_type: image.mimeType, data: imageData(image) } },
    ]),
  ] } }) + "\n" : prompt;
  let buffer = "", streamed = false, emitted = false;
  function parse(line: string): string {
    if (!line.trim()) return "";
    let event: any;
    try { event = JSON.parse(line); } catch { return ""; }
    if (event.type === "stream_event") {
      if (event.event?.type === "message_start") streamed = false;
      if (event.event?.delta?.type === "text_delta") { streamed = true; emitted = true; return event.event.delta.text ?? ""; }
    }
    if (event.type === "assistant" && !streamed) {
      const text = (event.message?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n\n");
      if (text) emitted = true;
      return text;
    }
    if (event.type === "result") {
      if (event.is_error) throw new Error((event.errors ?? [event.result ?? "Claude-Bildanfrage fehlgeschlagen."]).join("\n"));
      if (!emitted && typeof event.result === "string") { emitted = true; return event.result; }
    }
    return "";
  }
  for await (const chunk of runner(args, input, signal)) {
    if (signal?.aborted) return;
    if (!images.length) { if (chunk) yield { type: "content", text: chunk }; continue; }
    buffer += chunk;
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) { const text = parse(line); if (text) yield { type: "content", text }; }
  }
  if (images.length && !signal?.aborted) { const text = parse(buffer); if (text) yield { type: "content", text }; }
}
