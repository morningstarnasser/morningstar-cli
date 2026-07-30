import { test } from "node:test";
import assert from "node:assert/strict";
import type { MCPTool, MCPToolCallResult } from "../src/mcp-client.js";
import {
  MCPToolRegistry,
  qualifyToolName,
  splitQualifiedName,
  type MCPClientLike,
} from "../src/runtime/mcp-registry.js";

class FakeClient implements MCPClientLike {
  connected = false;
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  constructor(private toolList: MCPTool[], private opts: { failConnect?: boolean } = {}) {}
  async connect() {
    if (this.opts.failConnect) throw new Error("connect failed");
    this.connected = true;
  }
  async listTools() {
    return this.toolList;
  }
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    this.calls.push({ name, args });
    return { content: [{ type: "text", text: `${name}(${JSON.stringify(args)})` }] };
  }
  async disconnect() {
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
}

const tool = (name: string): MCPTool => ({ name, description: `desc ${name}` });

test("qualify + split round-trip (tool name may contain separator)", () => {
  assert.equal(qualifyToolName("fs", "read"), "fs__read");
  assert.deepEqual(splitQualifiedName("fs__read"), { server: "fs", tool: "read" });
  assert.deepEqual(splitQualifiedName("git__sub__cmd"), { server: "git", tool: "sub__cmd" });
  assert.equal(splitQualifiedName("noseparator"), undefined);
});

test("register tracks server without connecting", () => {
  const reg = new MCPToolRegistry();
  const c = new FakeClient([tool("read")]);
  reg.register("fs", c);
  assert.ok(reg.has("fs"));
  assert.deepEqual(reg.names(), ["fs"]);
  assert.equal(reg.get("fs")?.status, "registered");
  assert.equal(c.connected, false);
});

test("start connects, caches tools, sets status connected", async () => {
  const reg = new MCPToolRegistry();
  reg.register("fs", new FakeClient([tool("read"), tool("write")]));
  const s = await reg.start("fs");
  assert.equal(s.status, "connected");
  assert.equal(s.tools.length, 2);
});

test("start failure sets status error and keeps registry usable", async () => {
  const reg = new MCPToolRegistry();
  reg.register("bad", new FakeClient([], { failConnect: true }));
  const s = await reg.start("bad");
  assert.equal(s.status, "error");
  assert.match(s.error ?? "", /connect failed/);
  assert.equal(reg.listTools().length, 0);
});

test("listTools aggregates connected servers under a namespace", async () => {
  const reg = new MCPToolRegistry();
  reg.register("fs", new FakeClient([tool("read")]));
  reg.register("web", new FakeClient([tool("fetch")]));
  await reg.startAll();
  const names = reg.listTools().map((t) => t.qualifiedName).sort();
  assert.deepEqual(names, ["fs__read", "web__fetch"]);
});

test("dispatch routes to the owning server", async () => {
  const reg = new MCPToolRegistry();
  const fs = new FakeClient([tool("read")]);
  const web = new FakeClient([tool("fetch")]);
  reg.register("fs", fs);
  reg.register("web", web);
  await reg.startAll();
  const res = await reg.dispatch("web__fetch", { url: "x" });
  assert.match(res.content[0].text ?? "", /fetch/);
  assert.equal(web.calls.length, 1);
  assert.equal(web.calls[0].name, "fetch");
  assert.equal(fs.calls.length, 0, "other server is not called");
});

test("dispatch to unknown tool throws", async () => {
  const reg = new MCPToolRegistry();
  reg.register("fs", new FakeClient([tool("read")]));
  await reg.start("fs");
  await assert.rejects(() => reg.dispatch("fs__missing", {}), /Unknown MCP tool/);
  await assert.rejects(() => reg.dispatch("ghost__x", {}), /Unknown MCP tool/);
});

test("stop disconnects and clears tools; unregister removes", async () => {
  const reg = new MCPToolRegistry();
  const c = new FakeClient([tool("read")]);
  reg.register("fs", c);
  await reg.start("fs");
  await reg.stop("fs");
  assert.equal(reg.get("fs")?.status, "stopped");
  assert.equal(c.connected, false);
  assert.equal(reg.listTools().length, 0);
  assert.equal(await reg.unregister("fs"), true);
  assert.equal(reg.has("fs"), false);
  assert.equal(await reg.unregister("fs"), false);
});

test("statuses reports every server", async () => {
  const reg = new MCPToolRegistry();
  reg.register("a", new FakeClient([tool("x")]));
  reg.register("b", new FakeClient([], { failConnect: true }));
  await reg.startAll();
  assert.deepEqual(reg.statuses(), { a: "connected", b: "error" });
});
