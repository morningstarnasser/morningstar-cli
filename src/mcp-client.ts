// ─── MCP Protocol Client ─────────────────────────────────
// JSON-RPC over stdio communication with MCP servers

import { spawn, type ChildProcess } from "node:child_process";

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
  content: Array<{ type: string; text?: string }>;
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

export class MCPClient {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private buffer = "";
  private initialized = false;

  constructor(private config: MCPServerConfig) {}

  async connect(): Promise<void> {
    const args = this.config.args || [];
    this.process = spawn(this.config.command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(this.config.env || {}) },
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on("data", (_data: Buffer) => {
      // MCP servers may log to stderr — ignore
    });

    this.process.on("exit", () => {
      this.initialized = false;
      for (const [, pending] of this.pending) {
        pending.reject(new Error("MCP server process exited"));
      }
      this.pending.clear();
    });

    // Initialize
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "morningstar-cli", version: "1.0.0" },
    });

    // Send initialized notification
    this.sendNotification("notifications/initialized", {});
    this.initialized = true;
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed) as JSONRPCResponse;
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

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
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
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);

      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (err) => { clearTimeout(timeout); reject(err); },
      });

      this.process.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process?.stdin) return;
    const notification = { jsonrpc: "2.0", method, params };
    this.process.stdin.write(JSON.stringify(notification) + "\n");
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) throw new Error("MCP client not initialized");
    const result = await this.sendRequest("tools/list") as { tools: MCPTool[] };
    return result.tools || [];
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.initialized) throw new Error("MCP client not initialized");
    const result = await this.sendRequest("tools/call", { name, arguments: arguments_ }) as MCPToolCallResult;
    return result;
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.initialized = false;
    this.pending.clear();
  }

  isConnected(): boolean {
    return this.initialized && this.process !== null;
  }
}
