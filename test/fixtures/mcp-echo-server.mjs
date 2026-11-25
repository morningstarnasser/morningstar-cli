let buffer = "";
const initializeDelayMs = Number(process.env.MCP_INITIALIZE_DELAY_MS || "0");
const instanceName = process.env.MCP_INSTANCE_NAME || "default";
const listMode = process.env.MCP_LIST_MODE || "default";
const resultMode = process.env.MCP_RESULT_MODE || "default";
let dynamicToolsChanged = false;

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function notify(method) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
}

function schemaTool(index) {
  return {
    name: `Schema-Tool-${index}`,
    description: `Schema tool ${index}`,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 24 }, (_, propertyIndex) => [
          `property_${propertyIndex}`,
          {
            type: "string",
            description: `Long description ${propertyIndex} `.repeat(8),
          },
        ]),
      ),
      required: ["property_0", "property_23"],
    },
  };
}

function listedTools(cursor) {
  if (listMode === "paginated") {
    return cursor === "page-2"
      ? { tools: [{ name: "Page-Two", description: "Second page" }] }
      : {
          tools: [{ name: "Page-One", description: "First page" }],
          nextCursor: "page-2",
        };
  }
  if (listMode === "cursor-loop") {
    return {
      tools: [{ name: `Loop-${cursor || "first"}`, description: "Loop" }],
      nextCursor: "same-cursor",
    };
  }
  if (listMode === "dynamic") {
    return {
      tools: [
        {
          name: dynamicToolsChanged ? "After-Change" : "Before-Change",
          description: "Dynamic tool",
        },
        { name: "Trigger-List-Change", description: "Change tools" },
      ],
    };
  }
  if (listMode === "large-schema") {
    return { tools: [schemaTool(0)] };
  }
  if (listMode === "large-catalog") {
    return { tools: Array.from({ length: 128 }, (_, index) => ({ ...schemaTool(index), description: `Complete connected capability ${index}. `.repeat(40) })) };
  }
  return {
    tools: [
      {
        name: "Echo-Tool",
        description: "Echo structured arguments",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "Text to echo" },
          },
          required: ["message"],
        },
      },
      {
        name: "Slow-Tool",
        description: "Leave the request pending until the client disconnects",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "Exit-Tool",
        description: "Exit before replying to exercise lifecycle cleanup",
        inputSchema: { type: "object", properties: {} },
      },
      ...(resultMode === "rich"
        ? [{ name: "Rich-Tool", description: "Return every supported content kind" }]
        : []),
    ],
  };
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.id === undefined) continue;

    if (message.method === "initialize") {
      setTimeout(() => {
        reply(message.id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: listMode === "dynamic" ? { listChanged: true } : {},
          },
          serverInfo: { name: "morningstar-test", version: "1.0.0" },
        });
      }, initializeDelayMs);
    } else if (message.method === "tools/list") {
      reply(message.id, listedTools(message.params?.cursor));
    } else if (message.method === "tools/call") {
      if (message.params?.name === "Slow-Tool") {
        continue;
      }
      if (message.params?.name === "Exit-Tool") {
        process.exit(0);
      }
      if (message.params?.name === "Trigger-List-Change") {
        dynamicToolsChanged = true;
        notify("notifications/tools/list_changed");
      }
      if (message.params?.name === "Rich-Tool") {
        reply(message.id, {
          content: [
            { type: "image", data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png" },
            {
              type: "resource",
              resource: {
                uri: "resource://fixture/readme",
                mimeType: "text/plain",
                text: "embedded resource text",
              },
            },
            {
              type: "resource_link",
              uri: "https://example.test/resource",
              name: "Fixture resource",
              mimeType: "text/plain",
              description: "linked resource description",
            },
          ],
          structuredContent: { status: "ok", count: 3 },
          isError: false,
        });
        continue;
      }
      reply(message.id, {
        content: [{
          type: "text",
          text: `echo:${instanceName}:${JSON.stringify(message.params?.arguments ?? {})}`,
        }],
        isError: false,
      });
    } else {
      reply(message.id, {});
    }
  }
});
