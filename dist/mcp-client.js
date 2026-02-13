// ─── MCP Protocol Client ─────────────────────────────────
// JSON-RPC over stdio communication with MCP servers
import { spawn } from "node:child_process";
export class MCPClient {
    config;
    process = null;
    nextId = 1;
    pending = new Map();
    buffer = "";
    initialized = false;
    constructor(config) {
        this.config = config;
    }
    async connect() {
        const args = this.config.args || [];
        this.process = spawn(this.config.command, args, {
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, ...(this.config.env || {}) },
        });
        this.process.stdout?.on("data", (data) => {
            this.buffer += data.toString();
            this.processBuffer();
        });
        this.process.stderr?.on("data", (_data) => {
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
    processBuffer() {
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const msg = JSON.parse(trimmed);
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
    sendRequest(method, params) {
        return new Promise((resolve, reject) => {
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
    sendNotification(method, params) {
        if (!this.process?.stdin)
            return;
        const notification = { jsonrpc: "2.0", method, params };
        this.process.stdin.write(JSON.stringify(notification) + "\n");
    }
    async listTools() {
        if (!this.initialized)
            throw new Error("MCP client not initialized");
        const result = await this.sendRequest("tools/list");
        return result.tools || [];
    }
    async callTool(name, arguments_) {
        if (!this.initialized)
            throw new Error("MCP client not initialized");
        const result = await this.sendRequest("tools/call", { name, arguments: arguments_ });
        return result;
    }
    async disconnect() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        this.initialized = false;
        this.pending.clear();
    }
    isConnected() {
        return this.initialized && this.process !== null;
    }
}
//# sourceMappingURL=mcp-client.js.map