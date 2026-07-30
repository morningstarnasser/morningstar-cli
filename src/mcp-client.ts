// ─── MCP Protocol Client ─────────────────────────────────
// JSON-RPC over stdio communication with MCP servers

import { spawn, type ChildProcess } from "node:child_process";

const MAX_PROTOCOL_BUFFER_BYTES = 4 * 1024 * 1024;
const MAX_TOOL_LIST_PAGES = 32;
const MAX_LISTED_TOOLS = 128;
const INHERITED_ENV_KEYS = [
  "HOME",
  "USER",
  "LOGNAME",
  "PATH",
  "Path",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
] as const;

/**
 * MCP children get a minimal runtime environment. Provider/API credentials are
 * inherited only when the user explicitly places them in the server config.
 */
export function buildMCPEnvironment(
  explicit: Record<string, string> = {},
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const inherited: NodeJS.ProcessEnv = {};
  for (const key of INHERITED_ENV_KEYS) {
    if (source[key] !== undefined) inherited[key] = source[key];
  }
  return { ...inherited, ...explicit };
}

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
    name?: string;
    description?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    };
    [key: string]: unknown;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export class MCPClient {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private buffer = "";
  private initialized = false;
  private connectionGeneration = 0;
  private lastClosedGeneration = -1;

  constructor(
    private config: MCPServerConfig,
    private onClosed?: () => void,
    private onToolsChanged?: () => void,
  ) {}

  async connect(): Promise<void> {
    if (this.process) await this.disconnect();
    const generation = ++this.connectionGeneration;
    const args = this.config.args || [];
    const child = spawn(this.config.command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildMCPEnvironment(this.config.env),
    });
    this.process = child;

    child.stdout?.on("data", (data: Buffer) => {
      if (!this.ownsConnection(child, generation)) return;
      this.buffer += data.toString();
      if (Buffer.byteLength(this.buffer) > MAX_PROTOCOL_BUFFER_BYTES) {
        const error = new Error("MCP protocol buffer exceeded 4 MiB");
        this.rejectPending(error);
        child.kill();
        this.buffer = "";
        return;
      }
      this.processBuffer();
    });

    child.stderr?.on("data", (_data: Buffer) => {
      // MCP servers may log to stderr — ignore
    });

    child.on("error", (error) => {
      this.closeCurrentConnection(child, generation, error);
    });

    child.on("exit", () => {
      this.closeCurrentConnection(
        child,
        generation,
        new Error("MCP server process exited"),
      );
    });

    try {
      // Initialize
      await this.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "morningstar-cli", version: "1.0.0" },
      });

      // Send initialized notification
      this.sendNotification("notifications/initialized", {});
      this.initialized = true;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private ownsConnection(child: ChildProcess, generation: number): boolean {
    return this.connectionGeneration === generation && this.process === child;
  }

  private closeCurrentConnection(
    child: ChildProcess,
    generation: number,
    error: Error,
  ): void {
    if (!this.ownsConnection(child, generation)) return;
    this.process = null;
    this.initialized = false;
    this.buffer = "";
    this.rejectPending(error);
    this.notifyClosed(generation);
  }

  private notifyClosed(generation: number): void {
    if (this.lastClosedGeneration === generation) return;
    this.lastClosedGeneration = generation;
    this.onClosed?.();
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed) as JSONRPCResponse & JSONRPCNotification;
        if (
          msg.id === undefined
          && msg.method === "notifications/tools/list_changed"
        ) {
          this.onToolsChanged?.();
          continue;
        }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const pending = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {}
    }
  }

  private sendRequest(
    method: string,
    params?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        const error = new Error(`MCP request aborted: ${method}`);
        error.name = "AbortError";
        reject(error);
        return;
      }
      if (!this.process?.stdin) {
        reject(new Error("MCP server not connected"));
        return;
      }

      const id = this.nextId++;
      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.pending.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          signal?.removeEventListener("abort", onAbort);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);

      const onAbort = () => {
        if (!this.pending.has(id)) return;
        this.sendNotification("notifications/cancelled", {
          requestId: id,
          reason: `Morningstar aborted ${method}`,
        });
        this.pending.delete(id);
        clearTimeout(timeout);
        const error = new Error(`MCP request aborted: ${method}`);
        error.name = "AbortError";
        reject(error);
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", onAbort);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", onAbort);
          reject(err);
        },
      });

      try {
        this.process.stdin.write(JSON.stringify(request) + "\n");
      } catch (error) {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        this.pending.delete(id);
        reject(error as Error);
      }
    });
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process?.stdin) return;
    const notification = { jsonrpc: "2.0", method, params };
    try {
      this.process.stdin.write(JSON.stringify(notification) + "\n");
    } catch {}
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) throw new Error("MCP client not initialized");
    let tools: MCPTool[] = [];
    let seenCursors: readonly string[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_TOOL_LIST_PAGES; page += 1) {
      const result = await this.sendRequest(
        "tools/list",
        cursor ? { cursor } : undefined,
      ) as { tools?: unknown; nextCursor?: unknown };
      if (!Array.isArray(result?.tools)) {
        throw new Error("MCP tools/list response did not contain a tools array");
      }
      const remaining = MAX_LISTED_TOOLS - tools.length;
      tools = [...tools, ...(result.tools as MCPTool[]).slice(0, remaining)];

      const nextCursor = typeof result.nextCursor === "string" && result.nextCursor
        ? result.nextCursor
        : undefined;
      if (!nextCursor || tools.length >= MAX_LISTED_TOOLS) return tools;
      if (seenCursors.includes(nextCursor)) {
        throw new Error("MCP tools/list returned a repeated cursor");
      }
      seenCursors = [...seenCursors, nextCursor];
      cursor = nextCursor;
    }
    throw new Error(`MCP tools/list exceeded ${MAX_TOOL_LIST_PAGES} pages`);
  }

  async callTool(
    name: string,
    arguments_: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<MCPToolCallResult> {
    if (!this.initialized) throw new Error("MCP client not initialized");
    const result = await this.sendRequest(
      "tools/call",
      { name, arguments: arguments_ },
      signal,
    ) as MCPToolCallResult;
    return result;
  }

  async disconnect(): Promise<void> {
    const child = this.process;
    const generation = this.connectionGeneration;
    this.connectionGeneration += 1;
    this.process = null;
    this.initialized = false;
    this.rejectPending(new Error("MCP server disconnected"));
    this.buffer = "";
    child?.kill();
    this.notifyClosed(generation);
  }

  isConnected(): boolean {
    return this.initialized && this.process !== null;
  }
}
