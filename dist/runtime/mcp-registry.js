// ─── MCP Tool Registry (lifecycle bridge) ────────────────────────────────────
// claw-code-style lifecycle registry over Carry's existing MCPClient: tracks
// multiple named servers, aggregates their tools under a stable namespace, and
// routes tool dispatch to the owning server. Additive — it composes the existing
// stdio client (src/mcp-client.ts) without changing it, and the live gateway is
// untouched.
//
// Works against an interface (MCPClientLike), so tests inject a fake client and
// no real child process is spawned.
/** Separator between server name and tool name in a qualified tool name. */
export const MCP_NAME_SEP = "__";
export function qualifyToolName(server, tool) {
    return `${server}${MCP_NAME_SEP}${tool}`;
}
/** Split a qualified name at the FIRST separator (tool names may contain it). */
export function splitQualifiedName(qualified) {
    const idx = qualified.indexOf(MCP_NAME_SEP);
    if (idx <= 0 || idx + MCP_NAME_SEP.length >= qualified.length)
        return undefined;
    return { server: qualified.slice(0, idx), tool: qualified.slice(idx + MCP_NAME_SEP.length) };
}
export class MCPToolRegistry {
    servers = new Map();
    /** Register a server's client (does not connect). Idempotent by name. */
    register(name, client) {
        this.servers.set(name, { name, client, status: "registered", tools: [] });
    }
    has(name) {
        return this.servers.has(name);
    }
    get(name) {
        return this.servers.get(name);
    }
    names() {
        return [...this.servers.keys()];
    }
    statuses() {
        const out = {};
        for (const [name, s] of this.servers)
            out[name] = s.status;
        return out;
    }
    /** Connect a server and cache its tool list. On failure: status "error". */
    async start(name) {
        const server = this.servers.get(name);
        if (!server)
            throw new Error(`MCP server not registered: ${name}`);
        try {
            await server.client.connect();
            server.tools = await server.client.listTools();
            server.status = "connected";
            server.error = undefined;
        }
        catch (err) {
            server.status = "error";
            server.error = err instanceof Error ? err.message : String(err);
            server.tools = [];
        }
        return server;
    }
    /** Connect every registered server; returns each server's final state. */
    async startAll() {
        return Promise.all(this.names().map((n) => this.start(n)));
    }
    /** Disconnect a server (status "stopped"). No-op if unknown. */
    async stop(name) {
        const server = this.servers.get(name);
        if (!server)
            return;
        await server.client.disconnect();
        server.status = "stopped";
        server.tools = [];
    }
    async stopAll() {
        await Promise.all(this.names().map((n) => this.stop(n)));
    }
    /** Disconnect and remove a server. */
    async unregister(name) {
        if (!this.servers.has(name))
            return false;
        await this.stop(name);
        return this.servers.delete(name);
    }
    /** All tools across connected servers, each namespaced as `server__tool`. */
    listTools() {
        const out = [];
        for (const server of this.servers.values()) {
            if (server.status !== "connected")
                continue;
            for (const tool of server.tools) {
                out.push({ ...tool, server: server.name, qualifiedName: qualifyToolName(server.name, tool.name) });
            }
        }
        return out;
    }
    /** Resolve a qualified tool name to its server + tool spec. */
    findTool(qualifiedName) {
        const parts = splitQualifiedName(qualifiedName);
        if (!parts)
            return undefined;
        const server = this.servers.get(parts.server);
        if (!server || server.status !== "connected")
            return undefined;
        const tool = server.tools.find((t) => t.name === parts.tool);
        if (!tool)
            return undefined;
        return { server, tool };
    }
    /** Route a tool call (`server__tool`) to the owning server. */
    async dispatch(qualifiedName, args) {
        const resolved = this.findTool(qualifiedName);
        if (!resolved)
            throw new Error(`Unknown MCP tool: ${qualifiedName}`);
        return resolved.server.client.callTool(resolved.tool.name, args);
    }
}
//# sourceMappingURL=mcp-registry.js.map