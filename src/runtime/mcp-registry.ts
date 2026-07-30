// ─── MCP Tool Registry (lifecycle bridge) ────────────────────────────────────
// claw-code-style lifecycle registry over Carry's existing MCPClient: tracks
// multiple named servers, aggregates their tools under a stable namespace, and
// routes tool dispatch to the owning server. Additive — it composes the existing
// stdio client (src/mcp-client.ts) without changing it, and the live gateway is
// untouched.
//
// Works against an interface (MCPClientLike), so tests inject a fake client and
// no real child process is spawned.

import type { MCPTool, MCPToolCallResult } from "../mcp-client.js";

/** The slice of MCPClient the registry depends on (real client satisfies it). */
export interface MCPClientLike {
  connect(): Promise<void>;
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

export type ServerStatus = "registered" | "connected" | "stopped" | "error";

export interface RegisteredServer {
  name: string;
  client: MCPClientLike;
  status: ServerStatus;
  tools: MCPTool[];
  error?: string;
}

/** A tool exposed under `server__tool`, carrying its owning server. */
export interface NamespacedTool extends MCPTool {
  server: string;
  qualifiedName: string;
}

/** Separator between server name and tool name in a qualified tool name. */
export const MCP_NAME_SEP = "__";

export function qualifyToolName(server: string, tool: string): string {
  return `${server}${MCP_NAME_SEP}${tool}`;
}

/** Split a qualified name at the FIRST separator (tool names may contain it). */
export function splitQualifiedName(qualified: string): { server: string; tool: string } | undefined {
  const idx = qualified.indexOf(MCP_NAME_SEP);
  if (idx <= 0 || idx + MCP_NAME_SEP.length >= qualified.length) return undefined;
  return { server: qualified.slice(0, idx), tool: qualified.slice(idx + MCP_NAME_SEP.length) };
}

export class MCPToolRegistry {
  private servers = new Map<string, RegisteredServer>();

  /** Register a server's client (does not connect). Idempotent by name. */
  register(name: string, client: MCPClientLike): void {
    this.servers.set(name, { name, client, status: "registered", tools: [] });
  }

  has(name: string): boolean {
    return this.servers.has(name);
  }

  get(name: string): RegisteredServer | undefined {
    return this.servers.get(name);
  }

  names(): string[] {
    return [...this.servers.keys()];
  }

  statuses(): Record<string, ServerStatus> {
    const out: Record<string, ServerStatus> = {};
    for (const [name, s] of this.servers) out[name] = s.status;
    return out;
  }

  /** Connect a server and cache its tool list. On failure: status "error". */
  async start(name: string): Promise<RegisteredServer> {
    const server = this.servers.get(name);
    if (!server) throw new Error(`MCP server not registered: ${name}`);
    try {
      await server.client.connect();
      server.tools = await server.client.listTools();
      server.status = "connected";
      server.error = undefined;
    } catch (err) {
      server.status = "error";
      server.error = err instanceof Error ? err.message : String(err);
      server.tools = [];
    }
    return server;
  }

  /** Connect every registered server; returns each server's final state. */
  async startAll(): Promise<RegisteredServer[]> {
    return Promise.all(this.names().map((n) => this.start(n)));
  }

  /** Disconnect a server (status "stopped"). No-op if unknown. */
  async stop(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) return;
    await server.client.disconnect();
    server.status = "stopped";
    server.tools = [];
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.names().map((n) => this.stop(n)));
  }

  /** Disconnect and remove a server. */
  async unregister(name: string): Promise<boolean> {
    if (!this.servers.has(name)) return false;
    await this.stop(name);
    return this.servers.delete(name);
  }

  /** All tools across connected servers, each namespaced as `server__tool`. */
  listTools(): NamespacedTool[] {
    const out: NamespacedTool[] = [];
    for (const server of this.servers.values()) {
      if (server.status !== "connected") continue;
      for (const tool of server.tools) {
        out.push({ ...tool, server: server.name, qualifiedName: qualifyToolName(server.name, tool.name) });
      }
    }
    return out;
  }

  /** Resolve a qualified tool name to its server + tool spec. */
  findTool(qualifiedName: string): { server: RegisteredServer; tool: MCPTool } | undefined {
    const parts = splitQualifiedName(qualifiedName);
    if (!parts) return undefined;
    const server = this.servers.get(parts.server);
    if (!server || server.status !== "connected") return undefined;
    const tool = server.tools.find((t) => t.name === parts.tool);
    if (!tool) return undefined;
    return { server, tool };
  }

  /** Route a tool call (`server__tool`) to the owning server. */
  async dispatch(qualifiedName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const resolved = this.findTool(qualifiedName);
    if (!resolved) throw new Error(`Unknown MCP tool: ${qualifiedName}`);
    return resolved.server.client.callTool(resolved.tool.name, args);
  }
}
