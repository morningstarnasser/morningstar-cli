// ─── MCP Protocol Client ─────────────────────────────────
// JSON-RPC over stdio communication with MCP servers
import { spawn } from "node:child_process";
const MAX_PROTOCOL_BUFFER_BYTES = 4 * 1024 * 1024;
const MAX_TOOL_LIST_PAGES = 32;
const MAX_LISTED_TOOLS = 128;
const INHERITED_ENV_KEYS = [
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
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
];
/**
 * MCP children get a minimal runtime environment. Provider/API credentials are
 * inherited only when the user explicitly places them in the server config.
 */
export function buildMCPEnvironment(explicit = {}, source = process.env) {
    const inherited = {};
    for (const key of INHERITED_ENV_KEYS) {
        if (source[key] !== undefined)
            inherited[key] = source[key];
    }
    return { ...inherited, ...explicit };
}
export class MCPClient {
    config;
    onClosed;
    onToolsChanged;
    process = null;
    nextId = 1;
    pending = new Map();
    buffer = "";
    initialized = false;
    connectionGeneration = 0;
    lastClosedGeneration = -1;
    constructor(config, onClosed, onToolsChanged) {
        this.config = config;
        this.onClosed = onClosed;
        this.onToolsChanged = onToolsChanged;
    }
    async connect() {
        if (this.process)
            await this.disconnect();
        const generation = ++this.connectionGeneration;
        const args = this.config.args || [];
        const child = spawn(this.config.command, args, {
            stdio: ["pipe", "pipe", "pipe"],
            env: buildMCPEnvironment(this.config.env),
        });
        this.process = child;
        child.stdout?.on("data", (data) => {
            if (!this.ownsConnection(child, generation))
                return;
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
        child.stderr?.on("data", (_data) => {
            // MCP servers may log to stderr — ignore
        });
        child.on("error", (error) => {
            this.closeCurrentConnection(child, generation, error);
        });
        // A server may close its pipe before its exit event arrives (notably on
        // Windows). Handle stale pipe errors too, without closing a new connection.
        child.stdin?.on("error", (error) => {
            if (this.ownsConnection(child, generation))
                child.kill();
            this.closeCurrentConnection(child, generation, error);
        });
        child.on("exit", () => {
            this.closeCurrentConnection(child, generation, new Error("MCP server process exited"));
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
        }
        catch (error) {
            await this.disconnect();
            throw error;
        }
    }
    rejectPending(error) {
        for (const pending of this.pending.values())
            pending.reject(error);
        this.pending.clear();
    }
    ownsConnection(child, generation) {
        return this.connectionGeneration === generation && this.process === child;
    }
    closeCurrentConnection(child, generation, error) {
        if (!this.ownsConnection(child, generation))
            return;
        this.process = null;
        this.initialized = false;
        this.buffer = "";
        this.rejectPending(error);
        this.notifyClosed(generation);
    }
    notifyClosed(generation) {
        if (this.lastClosedGeneration === generation)
            return;
        this.lastClosedGeneration = generation;
        this.onClosed?.();
    }
    processBuffer() {
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const msg = JSON.parse(trimmed);
                if (msg.id === undefined
                    && msg.method === "notifications/tools/list_changed") {
                    this.onToolsChanged?.();
                    continue;
                }
                if (msg.id !== undefined && this.pending.has(msg.id)) {
                    const pending = this.pending.get(msg.id);
                    this.pending.delete(msg.id);
                    if (msg.error) {
                        pending.reject(new Error(msg.error.message));
                    }
                    else {
                        pending.resolve(msg.result);
                    }
                }
            }
            catch { }
        }
    }
    sendRequest(method, params, signal) {
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
            const request = {
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
                if (!this.pending.has(id))
                    return;
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
            }
            catch (error) {
                clearTimeout(timeout);
                signal?.removeEventListener("abort", onAbort);
                this.pending.delete(id);
                reject(error);
            }
        });
    }
    sendNotification(method, params) {
        if (!this.process?.stdin)
            return;
        const notification = { jsonrpc: "2.0", method, params };
        try {
            this.process.stdin.write(JSON.stringify(notification) + "\n");
        }
        catch { }
    }
    async listTools() {
        if (!this.initialized)
            throw new Error("MCP client not initialized");
        let tools = [];
        let seenCursors = [];
        let cursor;
        for (let page = 0; page < MAX_TOOL_LIST_PAGES; page += 1) {
            const result = await this.sendRequest("tools/list", cursor ? { cursor } : undefined);
            if (!Array.isArray(result?.tools)) {
                throw new Error("MCP tools/list response did not contain a tools array");
            }
            const remaining = MAX_LISTED_TOOLS - tools.length;
            tools = [...tools, ...result.tools.slice(0, remaining)];
            const nextCursor = typeof result.nextCursor === "string" && result.nextCursor
                ? result.nextCursor
                : undefined;
            if (!nextCursor || tools.length >= MAX_LISTED_TOOLS)
                return tools;
            if (seenCursors.includes(nextCursor)) {
                throw new Error("MCP tools/list returned a repeated cursor");
            }
            seenCursors = [...seenCursors, nextCursor];
            cursor = nextCursor;
        }
        throw new Error(`MCP tools/list exceeded ${MAX_TOOL_LIST_PAGES} pages`);
    }
    async callTool(name, arguments_, signal) {
        if (!this.initialized)
            throw new Error("MCP client not initialized");
        const result = await this.sendRequest("tools/call", { name, arguments: arguments_ }, signal);
        return result;
    }
    async disconnect() {
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
    isConnected() {
        return this.initialized && this.process !== null;
    }
}
//# sourceMappingURL=mcp-client.js.map