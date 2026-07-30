import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { decidePermission } from "../src/policy-engine.js";
import {
  callQualifiedMCPTool,
  connectMCPServer,
  disconnectAllMCPServers,
  disconnectMCPServer,
  formatConnectedMCPToolsForPrompt,
  getConnectedMCPTools,
  qualifyMCPToolName,
  removeMCPServer,
  serializeMCPToolResult,
} from "../src/mcp.js";
import { buildMCPEnvironment, MCPClient } from "../src/mcp-client.js";
import { getOpenAIToolDefinitions } from "../src/tool-definitions.js";
import { executeNativeToolCall, executeToolCall, parseToolCalls } from "../src/tools.js";

const fixture = fileURLToPath(new URL("./fixtures/mcp-echo-server.mjs", import.meta.url));

async function waitFor(
  condition: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error(`condition was not met within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("MCP aliases are lowercase, provider-safe, deterministic, and bounded", () => {
  assert.match(
    qualifyMCPToolName("My Server", "Echo-Tool"),
    /^mcp__my_server__echo_tool__[a-f0-9]{16}$/,
  );
  assert.notEqual(
    qualifyMCPToolName("a-b", "echo"),
    qualifyMCPToolName("a_b", "echo"),
  );
  const long = qualifyMCPToolName("server".repeat(20), "tool".repeat(30));
  assert.match(long, /^mcp__[a-z0-9_]+$/);
  assert.ok(long.length <= 64);
  assert.equal(long, qualifyMCPToolName("server".repeat(20), "tool".repeat(30)));
});

test("MCP child environment excludes inherited secrets and runtime injection", () => {
  const source = {
    HOME: "/tmp/morningstar-test-home",
    PATH: "/usr/bin",
    OPENAI_API_KEY: "inherited-openai-secret",
    NVIDIA_API_KEY: "inherited-nvidia-secret",
    HF_TOKEN: "inherited-hf-secret",
    NODE_OPTIONS: "--require=/tmp/injected.cjs",
  };

  const environment = buildMCPEnvironment(
    { CUSTOM_MCP_VALUE: "explicit-value" },
    source,
  );
  assert.equal(environment.HOME, source.HOME);
  assert.equal(environment.PATH, source.PATH);
  assert.equal(environment.CUSTOM_MCP_VALUE, "explicit-value");
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.NVIDIA_API_KEY, undefined);
  assert.equal(environment.HF_TOKEN, undefined);
  assert.equal(environment.NODE_OPTIONS, undefined);

  const explicitlyConfigured = buildMCPEnvironment(
    { OPENAI_API_KEY: "explicit-openai-secret" },
    source,
  );
  assert.equal(explicitlyConfigured.OPENAI_API_KEY, "explicit-openai-secret");
});

test("missing MCP command rejects connect without crashing the process", async () => {
  const client = new MCPClient({
    command: "/definitely/not/a/real/morningstar-mcp-command",
  });
  await assert.rejects(client.connect(), /ENOENT|spawn/i);
  assert.equal(client.isConnected(), false);
});

test("pending MCP tool call rejects promptly when the client disconnects", async (t) => {
  const client = new MCPClient({
    command: process.execPath,
    args: [fixture],
  });
  t.after(() => client.disconnect());
  await client.connect();

  const startedAt = Date.now();
  const rejected = assert.rejects(
    client.callTool("Slow-Tool", {}),
    /disconnected/i,
  );
  await client.disconnect();
  await rejected;
  assert.ok(
    Date.now() - startedAt < 1_000,
    "disconnect should reject a pending request instead of waiting for its timeout",
  );
});

test("reconnecting one MCPClient ignores the previous child's delayed exit", async (t) => {
  let closedCount = 0;
  const client = new MCPClient(
    { command: process.execPath, args: [fixture] },
    () => { closedCount += 1; },
  );
  t.after(() => client.disconnect());

  await client.connect();
  await client.connect();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(client.isConnected(), true);
  assert.equal(closedCount, 1, "only the explicit reconnect shutdown is reported");
  assert.ok((await client.listTools()).some((tool) => tool.name === "Echo-Tool"));
});

test("tools/list follows cursor pagination and rejects cursor loops", async (t) => {
  const paginated = new MCPClient({
    command: process.execPath,
    args: [fixture],
    env: { MCP_LIST_MODE: "paginated" },
  });
  const looping = new MCPClient({
    command: process.execPath,
    args: [fixture],
    env: { MCP_LIST_MODE: "cursor-loop" },
  });
  t.after(async () => {
    await Promise.all([paginated.disconnect(), looping.disconnect()]);
  });

  await paginated.connect();
  assert.deepEqual(
    (await paginated.listTools()).map((tool) => tool.name),
    ["Page-One", "Page-Two"],
  );

  await looping.connect();
  await assert.rejects(looping.listTools(), /repeated cursor/i);
});

test("a newer same-name MCP connection supersedes an in-flight startup", async (t) => {
  t.after(() => disconnectAllMCPServers());
  const first = connectMCPServer("startup-race", {
    command: process.execPath,
    args: [fixture],
    env: {
      MCP_INITIALIZE_DELAY_MS: "150",
      MCP_INSTANCE_NAME: "first",
    },
  });
  const firstRejected = assert.rejects(
    first,
    /disconnected|superseded|exited/i,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));

  await connectMCPServer("startup-race", {
    command: process.execPath,
    args: [fixture],
    env: { MCP_INSTANCE_NAME: "second" },
  });
  await firstRejected;

  const echo = getConnectedMCPTools().find(
    (tool) => tool.serverName === "startup-race" && tool.name === "Echo-Tool",
  );
  assert.ok(echo);
  const result = await callQualifiedMCPTool(echo.qualifiedName, { message: "winner" });
  assert.equal(result.success, true);
  assert.match(result.result, /^echo:second:/);
});

test("tools/list_changed atomically replaces the published MCP tool registry", async (t) => {
  t.after(() => disconnectAllMCPServers());
  await connectMCPServer("dynamic-tools", {
    command: process.execPath,
    args: [fixture],
    env: { MCP_LIST_MODE: "dynamic" },
  });

  const trigger = getConnectedMCPTools().find(
    (tool) => tool.serverName === "dynamic-tools" && tool.name === "Trigger-List-Change",
  );
  assert.ok(trigger);
  assert.ok(getConnectedMCPTools().some((tool) => tool.name === "Before-Change"));

  const result = await callQualifiedMCPTool(trigger.qualifiedName, {});
  assert.equal(result.success, true);
  await waitFor(() =>
    getConnectedMCPTools().some(
      (tool) => tool.serverName === "dynamic-tools" && tool.name === "After-Change",
    ),
  );
  assert.equal(
    getConnectedMCPTools().some(
      (tool) => tool.serverName === "dynamic-tools" && tool.name === "Before-Change",
    ),
    false,
  );
});

test("text MCP prompt schemas remain valid bounded JSON without truncating native schemas", async (t) => {
  t.after(() => disconnectAllMCPServers());
  await connectMCPServer("large-schema", {
    command: process.execPath,
    args: [fixture],
    env: { MCP_LIST_MODE: "large-schema" },
  });

  const prompt = formatConnectedMCPToolsForPrompt();
  const schemaText = prompt.match(/<tool:[^>]+>(.*?)<\/tool>/s)?.[1];
  assert.ok(schemaText);
  assert.doesNotThrow(() => JSON.parse(schemaText));
  assert.ok(Buffer.byteLength(schemaText) <= 800);

  const nativeSchema = getOpenAIToolDefinitions().find(
    (definition) => definition.function.name.includes("schema_tool_0"),
  )?.function.parameters;
  assert.ok(nativeSchema);
  assert.ok(Object.hasOwn(nativeSchema.properties, "property_23"));
});

test("rich MCP results preserve resources, links, media metadata, and structured content", async (t) => {
  t.after(() => disconnectAllMCPServers());
  await connectMCPServer("rich-result", {
    command: process.execPath,
    args: [fixture],
    env: { MCP_RESULT_MODE: "rich" },
  });
  const richTool = getConnectedMCPTools().find(
    (tool) => tool.serverName === "rich-result" && tool.name === "Rich-Tool",
  );
  assert.ok(richTool);

  const result = await callQualifiedMCPTool(richTool.qualifiedName, {});
  assert.equal(result.success, true);
  assert.match(result.result, /MCP image: image\/png/);
  assert.match(result.result, /resource:\/\/fixture\/readme/);
  assert.match(result.result, /embedded resource text/);
  assert.match(result.result, /https:\/\/example\.test\/resource/);
  assert.match(result.result, /linked resource description/);
  assert.match(result.result, /MCP structured content/);
  assert.match(result.result, /"status":"ok"/);
});

test("rich MCP result truncation is UTF-8 safe and stays inside the byte cap", () => {
  const result = serializeMCPToolResult({
    content: [{
      type: "resource",
      resource: {
        uri: "resource://fixture/large",
        mimeType: "text/plain",
        text: "😀".repeat(200_000),
      },
    }],
  });

  assert.ok(Buffer.byteLength(result) <= 512_000);
  assert.match(result, /MCP result truncated/);
  assert.doesNotMatch(result, /�/);
});

test("disconnect and remove invalidate in-flight MCP startups", async (t) => {
  t.after(() => disconnectAllMCPServers());

  const disconnectPending = connectMCPServer("pending-disconnect", {
    command: process.execPath,
    args: [fixture],
    env: { MCP_INITIALIZE_DELAY_MS: "150" },
  });
  const disconnectRejected = assert.rejects(
    disconnectPending,
    /disconnected|superseded|exited/i,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  await disconnectMCPServer("pending-disconnect");
  await disconnectRejected;

  const removePending = connectMCPServer("pending-remove", {
    command: process.execPath,
    args: [fixture],
    env: { MCP_INITIALIZE_DELAY_MS: "150" },
  });
  const removeRejected = assert.rejects(
    removePending,
    /disconnected|superseded|exited/i,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(removeMCPServer("pending-remove"), false);
  await removeRejected;

  assert.equal(
    getConnectedMCPTools().some((tool) =>
      tool.serverName === "pending-disconnect" || tool.serverName === "pending-remove"),
    false,
  );
});

test("disconnect-all invalidates every in-flight MCP startup", async () => {
  const pending = ["pending-all-a", "pending-all-b"].map((name) =>
    connectMCPServer(name, {
      command: process.execPath,
      args: [fixture],
      env: { MCP_INITIALIZE_DELAY_MS: "150" },
    }));
  const outcomesPromise = Promise.allSettled(pending);
  await new Promise((resolve) => setTimeout(resolve, 20));

  await disconnectAllMCPServers();
  const outcomes = await outcomesPromise;
  assert.equal(outcomes.every(({ status }) => status === "rejected"), true);
  assert.equal(getConnectedMCPTools().length, 0);
});

test("AbortSignal cancels a pending qualified MCP tool call promptly", async (t) => {
  t.after(() => disconnectAllMCPServers());
  await connectMCPServer("abort-test", {
    command: process.execPath,
    args: [fixture],
  });
  const slowTool = getConnectedMCPTools().find(
    (tool) => tool.serverName === "abort-test" && tool.name === "Slow-Tool",
  );
  assert.ok(slowTool);

  const controller = new AbortController();
  const startedAt = Date.now();
  const pending = callQualifiedMCPTool(
    slowTool.qualifiedName,
    {},
    controller.signal,
  );
  controller.abort();
  const result = await pending;

  assert.equal(result.success, false);
  assert.match(result.result, /aborted/i);
  assert.ok(Date.now() - startedAt < 1_000);
});

test("qualified aliases remain stable across reconnects and normalized-name collisions", async (t) => {
  t.after(() => disconnectAllMCPServers());
  const config = { command: process.execPath, args: [fixture] };

  await connectMCPServer("a-b", config);
  await connectMCPServer("a_b", config);
  const initial = getConnectedMCPTools();
  const dashedAlias = initial.find(
    (tool) => tool.serverName === "a-b" && tool.name === "Echo-Tool",
  )?.qualifiedName;
  const underscoredAlias = initial.find(
    (tool) => tool.serverName === "a_b" && tool.name === "Echo-Tool",
  )?.qualifiedName;

  assert.ok(dashedAlias);
  assert.ok(underscoredAlias);
  assert.notEqual(dashedAlias, underscoredAlias);

  await disconnectMCPServer("a-b");
  await connectMCPServer("a-b", config);
  const reconnectedAlias = getConnectedMCPTools().find(
    (tool) => tool.serverName === "a-b" && tool.name === "Echo-Tool",
  )?.qualifiedName;
  assert.equal(reconnectedAlias, dashedAlias);
});

test("unexpected MCP child exit removes its advertised tools", async (t) => {
  t.after(() => disconnectAllMCPServers());
  await connectMCPServer("exit-test", {
    command: process.execPath,
    args: [fixture],
  });
  const exitTool = getConnectedMCPTools().find(
    (tool) => tool.serverName === "exit-test" && tool.name === "Exit-Tool",
  );
  assert.ok(exitTool);

  const result = await callQualifiedMCPTool(exitTool.qualifiedName, {});
  assert.equal(result.success, false);
  assert.match(result.result, /exited|not connected|nicht verbunden/i);

  await waitFor(() =>
    getConnectedMCPTools().every((tool) => tool.serverName !== "exit-test"),
  );
  assert.equal(
    getOpenAIToolDefinitions().some(
      (definition) => definition.function.name === exitTool.qualifiedName,
    ),
    false,
  );
});

test("connected MCP tools flow through schema, parser, executor, and disconnect", async (t) => {
  t.after(() => disconnectAllMCPServers());
  await connectMCPServer("Echo Server", {
    command: process.execPath,
    args: [fixture],
  }).then(
    () => assert.fail("invalid server names must be rejected"),
    (error: Error) => assert.match(error.message, /Ungueltiger MCP-Servername/),
  );

  await connectMCPServer("echo", {
    command: process.execPath,
    args: [fixture],
  });
  const [tool] = getConnectedMCPTools();
  assert.match(tool.qualifiedName, /^mcp__echo__echo_tool__[a-f0-9]{16}$/);
  assert.equal(tool.name, "Echo-Tool");

  const providerDefinition = getOpenAIToolDefinitions()
    .find((definition) => definition.function.name === tool.qualifiedName);
  assert.ok(providerDefinition);
  assert.deepEqual(providerDefinition.function.parameters.required, ["message"]);

  const policy = decidePermission(
    tool.qualifiedName,
    JSON.stringify({ message: "native" }),
    "ask",
  );
  assert.equal(policy.decision, "ask");
  assert.equal(policy.risk, "high");

  const native = await executeNativeToolCall(
    tool.qualifiedName,
    { message: "native" },
    process.cwd(),
  );
  assert.equal(native.success, true);
  assert.match(native.result, /"message":"native"/);

  const parsed = parseToolCalls(
    `<tool:${tool.qualifiedName}>{"message":"text"}</tool>`,
  );
  assert.deepEqual(parsed.calls[0].args, { message: "text" });
  const text = await executeToolCall(parsed.calls[0], process.cwd());
  assert.equal(text.success, true);
  assert.match(text.result, /"message":"text"/);

  await disconnectAllMCPServers();
  assert.equal(
    getOpenAIToolDefinitions().some((definition) =>
      definition.function.name === tool.qualifiedName),
    false,
  );
  const disconnected = await executeNativeToolCall(
    tool.qualifiedName,
    { message: "after" },
    process.cwd(),
  );
  assert.equal(disconnected.success, false);
  assert.match(disconnected.result, /nicht verbunden/);
});

test("text MCP calls reject non-object JSON before dispatch", () => {
  const parsed = parseToolCalls("<tool:mcp__echo__echo_tool>[1,2,3]</tool>");
  assert.match(parsed.calls[0].error ?? "", /JSON-Objekt/);
});
