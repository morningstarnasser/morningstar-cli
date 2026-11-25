// ─── MCP Server Management ───────────────────────────────
// Commander subcommands + runtime management for MCP servers
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { MCPClient, } from "./mcp-client.js";
const CONFIG_DIR = join(homedir(), ".morningstar");
const SETTINGS_FILE = join(CONFIG_DIR, "settings.json");
// Runtime MCP client instances
const activeClients = new Map();
const activeTools = new Map();
const pendingClients = new Map();
const connectionGenerations = new Map();
const toolRefreshGenerations = new Map();
const changeListeners = new Set();
export const MCP_TOOL_PREFIX = "mcp__";
const MAX_PROVIDER_TOOL_NAME = 64;
const MAX_TOOLS_PER_SERVER = 128;
const MAX_CONNECTED_MCP_TOOLS = 128;
const MAX_MCP_SCHEMA_BYTES = 100_000;
const MAX_MCP_TOTAL_SCHEMA_BYTES = 1_000_000;
const MAX_MCP_RESULT_BYTES = 512_000;
const MAX_PROMPT_SCHEMA_BYTES = 800;
const MAX_MCP_PROMPT_CHARS = 16000;
const MCP_PROMPT_HEADER = "=== VERBUNDENE MCP-TOOLS ===";
const MCP_PROMPT_FOOTER = "MCP-Tools koennen externe Systeme veraendern und laufen durch die normale Genehmigung.";
const MAX_MEDIA_PREVIEW_CHARS = 96;
const SERVER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/;
function notifyMCPChange() {
    for (const listener of changeListeners) {
        try {
            listener();
        }
        catch { }
    }
}
function advanceConnectionGeneration(name) {
    const generation = (connectionGenerations.get(name) ?? 0) + 1;
    connectionGenerations.set(name, generation);
    return generation;
}
function detachMCPClients(name) {
    const pending = pendingClients.get(name)?.client;
    const active = activeClients.get(name);
    const advertisedToolsChanged = activeClients.has(name) || activeTools.has(name);
    pendingClients.delete(name);
    activeClients.delete(name);
    activeTools.delete(name);
    return {
        clients: [...new Set([pending, active].filter((client) => Boolean(client)))],
        advertisedToolsChanged,
    };
}
async function closeMCPClients(clients) {
    await Promise.allSettled(clients.map((client) => client.disconnect()));
}
async function invalidateMCPServerRuntime(name) {
    advanceConnectionGeneration(name);
    const detached = detachMCPClients(name);
    if (detached.advertisedToolsChanged)
        notifyMCPChange();
    await closeMCPClients(detached.clients);
}
export function subscribeMCPChanges(listener) {
    changeListeners.add(listener);
    return () => {
        changeListeners.delete(listener);
    };
}
function safeToolComponent(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/^_+|_+$/g, "") || "tool";
}
/** Provider-safe, deterministic namespace for one exact MCP server/tool pair. */
export function qualifyMCPToolName(serverName, toolName) {
    const base = `${MCP_TOOL_PREFIX}${safeToolComponent(serverName)}__${safeToolComponent(toolName)}`;
    const digest = createHash("sha256")
        .update(`${serverName}\0${toolName}`)
        .digest("hex")
        .slice(0, 16);
    return `${base.slice(0, MAX_PROVIDER_TOOL_NAME - digest.length - 2)}__${digest}`;
}
export function isMCPToolName(name) {
    return name.startsWith(MCP_TOOL_PREFIX);
}
/** Synchronous snapshot used when constructing provider-native tool schemas. */
export function getConnectedMCPTools() {
    const connected = [];
    const exactTools = new Set();
    let schemaBytes = 0;
    for (const [serverName, tools] of activeTools) {
        const client = activeClients.get(serverName);
        if (!client?.isConnected())
            continue;
        for (const tool of tools) {
            if (connected.length >= MAX_CONNECTED_MCP_TOOLS)
                return connected;
            const exact = `${serverName}\0${tool.name}`;
            if (exactTools.has(exact))
                continue;
            const toolSchemaBytes = Buffer.byteLength(JSON.stringify(tool.inputSchema ?? {}));
            if (schemaBytes + toolSchemaBytes > MAX_MCP_TOTAL_SCHEMA_BYTES)
                continue;
            exactTools.add(exact);
            schemaBytes += toolSchemaBytes;
            const qualifiedName = qualifyMCPToolName(serverName, tool.name);
            connected.push({ ...tool, serverName, qualifiedName });
        }
    }
    return connected;
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function compactPropertySchema(value) {
    if (!isRecord(value))
        return {};
    const type = typeof value.type === "string" || Array.isArray(value.type)
        ? value.type
        : undefined;
    const format = typeof value.format === "string" ? value.format : undefined;
    const description = typeof value.description === "string"
        ? value.description.slice(0, 96)
        : undefined;
    return {
        ...(type ? { type } : {}),
        ...(format ? { format } : {}),
        ...(description ? { description } : {}),
    };
}
function buildTruncatedPromptSchema(properties, requiredNames) {
    const required = requiredNames.filter((name) => Object.hasOwn(properties, name));
    return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        $comment: "Schema gekürzt; native Tool-Provider erhalten das vollständige Schema.",
    };
}
function stringifyBoundedPromptSchema(inputSchema) {
    const schema = inputSchema ?? { type: "object", properties: {} };
    const serialized = JSON.stringify(schema);
    if (Buffer.byteLength(serialized) <= MAX_PROMPT_SCHEMA_BYTES)
        return serialized;
    const sourceProperties = isRecord(schema.properties)
        ? Object.entries(schema.properties)
        : [];
    const required = Array.isArray(schema.required)
        ? schema.required.filter((value) => typeof value === "string")
        : [];
    let keptProperties = {};
    for (const [name, definition] of sourceProperties) {
        const fullProperties = { ...keptProperties, [name]: definition };
        const full = JSON.stringify(buildTruncatedPromptSchema(fullProperties, required));
        if (Buffer.byteLength(full) <= MAX_PROMPT_SCHEMA_BYTES) {
            keptProperties = fullProperties;
            continue;
        }
        const compactProperties = {
            ...keptProperties,
            [name]: compactPropertySchema(definition),
        };
        const compact = JSON.stringify(buildTruncatedPromptSchema(compactProperties, required));
        if (Buffer.byteLength(compact) <= MAX_PROMPT_SCHEMA_BYTES) {
            keptProperties = compactProperties;
        }
    }
    return JSON.stringify(buildTruncatedPromptSchema(keptProperties, required));
}
export function formatConnectedMCPToolsForPrompt() {
    const tools = getConnectedMCPTools();
    if (tools.length === 0)
        return "";
    const detailed = [
        MCP_PROMPT_HEADER,
        ...tools.map((tool) => {
            const schema = stringifyBoundedPromptSchema(tool.inputSchema);
            return `<tool:${tool.qualifiedName}>${schema}</tool> - [${tool.serverName}] ${tool.description || tool.name}`;
        }),
        MCP_PROMPT_FOOTER,
    ].join("\n");
    if (detailed.length <= MAX_MCP_PROMPT_CHARS)
        return detailed;
    // Large registries already supply full native schemas separately. Keep every
    // exact name discoverable without duplicating those schemas in system text.
    const header = `${MCP_PROMPT_HEADER}\n${tools.length} Tools. Vollständige Parameter stehen in den nativen Tool-Schemas; keine Parameter erfinden.`;
    const names = tools.map(tool => `- ${tool.qualifiedName}: `);
    const reserved = header.length + MCP_PROMPT_FOOTER.length + 2 + names.reduce((n, name) => n + name.length + 1, 0);
    const descriptionChars = Math.max(0, Math.floor((MAX_MCP_PROMPT_CHARS - reserved) / tools.length));
    return [header, ...tools.map((tool, i) => names[i] + (tool.description || tool.name).replace(/\s+/g, " ").slice(0, descriptionChars)), MCP_PROMPT_FOOTER].join("\n");
}
/** Old TUI transcripts embedded a catalog; replace only that generated section
 * in provider requests. Stored history and surrounding operator rules survive. */
export function stripGeneratedMCPPrompt(content) {
    const pattern = /(?:^|\n)=== VERBUNDENE MCP-TOOLS ===\n[\s\S]*?\nMCP-Tools koennen externe Systeme veraendern und laufen durch die normale Genehmigung\.(?:\n|$)/g;
    return content.replace(pattern, "\n");
}
function normalizeMCPTools(tools) {
    const normalized = new Map();
    for (const tool of tools.slice(0, MAX_TOOLS_PER_SERVER)) {
        const name = typeof tool.name === "string" ? tool.name.trim() : "";
        if (!name || name.length > 128 || normalized.has(name))
            continue;
        let inputSchema;
        if (tool.inputSchema && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema)) {
            try {
                if (Buffer.byteLength(JSON.stringify(tool.inputSchema)) <= MAX_MCP_SCHEMA_BYTES) {
                    inputSchema = tool.inputSchema;
                }
            }
            catch { }
        }
        normalized.set(name, {
            name,
            description: typeof tool.description === "string"
                ? tool.description.slice(0, 1_000)
                : "",
            inputSchema,
        });
    }
    return [...normalized.values()];
}
function nextToolRefreshGeneration(name) {
    const generation = (toolRefreshGenerations.get(name) ?? 0) + 1;
    toolRefreshGenerations.set(name, generation);
    return generation;
}
function isCurrentMCPConnection(name, client, connectionGeneration) {
    return activeClients.get(name) === client
        && client.isConnected()
        && connectionGenerations.get(name) === connectionGeneration;
}
function scheduleMCPToolRefresh(name, client, connectionGeneration) {
    if (!isCurrentMCPConnection(name, client, connectionGeneration))
        return;
    const refreshGeneration = nextToolRefreshGeneration(name);
    if (activeTools.delete(name))
        notifyMCPChange();
    void client.listTools().then((listedTools) => {
        if (!isCurrentMCPConnection(name, client, connectionGeneration)
            || toolRefreshGenerations.get(name) !== refreshGeneration) {
            return;
        }
        activeTools.set(name, normalizeMCPTools(listedTools));
        notifyMCPChange();
    }).catch(() => {
        if (isCurrentMCPConnection(name, client, connectionGeneration)
            && toolRefreshGenerations.get(name) === refreshGeneration
            && activeTools.delete(name)) {
            notifyMCPChange();
        }
    });
}
/**
 * Get MCP server configurations from settings.
 */
export function getMCPServers(settings) {
    return settings.mcpServers || {};
}
/** Only explicitly opted-in, trusted server configurations start automatically. */
export async function connectConfiguredMCPServers(settings) {
    const failures = [];
    for (const [name, config] of Object.entries(getMCPServers(settings))) {
        if (config.autoConnect !== true)
            continue;
        let timer;
        try {
            await Promise.race([
                connectMCPServer(name, config),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Verbindung nach 8 Sekunden abgebrochen")), 8_000);
                }),
            ]);
        }
        catch (error) {
            await disconnectMCPServer(name);
            failures.push(`MCP ${name}: ${error.message}`);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    return failures;
}
/**
 * Add an MCP server to settings.
 */
export function addMCPServer(name, config) {
    if (!SERVER_NAME_PATTERN.test(name)) {
        throw new Error("MCP-Servername muss 1-32 Zeichen lang sein und darf nur Buchstaben, Zahlen, _ und - enthalten.");
    }
    if (!config.command?.trim() || config.command.includes("\0")) {
        throw new Error("MCP command ist leer oder ungueltig.");
    }
    let settings = {};
    try {
        if (existsSync(SETTINGS_FILE)) {
            settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
        }
    }
    catch { }
    if (!settings.mcpServers)
        settings.mcpServers = {};
    settings.mcpServers[name] = config;
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}
/**
 * Remove an MCP server from settings.
 */
export function removeMCPServer(name) {
    // Invalidate first, even when the configuration is project-local or missing.
    // MCPClient.disconnect performs its state transition and child kill before its
    // already-resolved promise yields, so a synchronous remove cannot later
    // publish an in-flight connection.
    void invalidateMCPServerRuntime(name).catch(() => undefined);
    let settings = {};
    try {
        if (existsSync(SETTINGS_FILE)) {
            settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
        }
    }
    catch { }
    if (!settings.mcpServers || !settings.mcpServers[name]) {
        return false;
    }
    delete settings.mcpServers[name];
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    return true;
}
/**
 * Connect to an MCP server.
 */
export async function connectMCPServer(name, config) {
    if (!SERVER_NAME_PATTERN.test(name)) {
        throw new Error(`Ungueltiger MCP-Servername: ${name}`);
    }
    const generation = advanceConnectionGeneration(name);
    const detached = detachMCPClients(name);
    if (detached.advertisedToolsChanged)
        notifyMCPChange();
    await closeMCPClients(detached.clients);
    if (connectionGenerations.get(name) !== generation) {
        throw new Error(`MCP connection "${name}" was superseded before startup.`);
    }
    const client = new MCPClient(config, () => {
        const pending = pendingClients.get(name);
        if (pending?.client === client) {
            pendingClients.delete(name);
        }
        if (activeClients.get(name) === client) {
            activeClients.delete(name);
            activeTools.delete(name);
            notifyMCPChange();
        }
    }, () => scheduleMCPToolRefresh(name, client, generation));
    pendingClients.set(name, { generation, client });
    try {
        await client.connect();
        const tools = normalizeMCPTools(await client.listTools());
        const pending = pendingClients.get(name);
        if (connectionGenerations.get(name) !== generation
            || pending?.generation !== generation
            || pending.client !== client) {
            throw new Error(`MCP connection "${name}" was superseded during startup.`);
        }
        pendingClients.delete(name);
        activeClients.set(name, client);
        activeTools.set(name, tools);
        notifyMCPChange();
        return tools;
    }
    catch (error) {
        if (pendingClients.get(name)?.client === client) {
            pendingClients.delete(name);
        }
        await client.disconnect().catch(() => undefined);
        throw error;
    }
}
/**
 * Disconnect an MCP server.
 */
export async function disconnectMCPServer(name) {
    advanceConnectionGeneration(name);
    const detached = detachMCPClients(name);
    await closeMCPClients(detached.clients);
    notifyMCPChange();
}
/**
 * Disconnect all MCP servers.
 */
export async function disconnectAllMCPServers() {
    const names = new Set([
        ...connectionGenerations.keys(),
        ...pendingClients.keys(),
        ...activeClients.keys(),
        ...activeTools.keys(),
    ]);
    const clients = new Set();
    for (const name of names) {
        advanceConnectionGeneration(name);
        for (const client of detachMCPClients(name).clients)
            clients.add(client);
    }
    await closeMCPClients([...clients]);
    notifyMCPChange();
}
function jsonStringifyResult(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return "[unserialisierbarer MCP-Inhalt]";
    }
}
function formatMediaContent(kind, content) {
    const mimeType = typeof content.mimeType === "string"
        ? content.mimeType
        : `application/octet-stream`;
    const data = typeof content.data === "string" ? content.data : "";
    const preview = data.slice(0, MAX_MEDIA_PREVIEW_CHARS);
    const suffix = data.length > preview.length ? "…" : "";
    return `[MCP ${kind}: ${mimeType}; ${data.length} base64 chars; preview=${preview}${suffix}]`;
}
function formatResourceContent(content) {
    const resource = isRecord(content.resource)
        ? content.resource
        : {};
    const uri = typeof resource.uri === "string" ? resource.uri : "unknown";
    const mimeType = typeof resource.mimeType === "string" ? resource.mimeType : "unknown";
    const header = `[MCP resource: ${uri}; ${mimeType}]`;
    if (typeof resource.text === "string")
        return `${header}\n${resource.text}`;
    if (typeof resource.blob === "string") {
        const preview = resource.blob.slice(0, MAX_MEDIA_PREVIEW_CHARS);
        const suffix = resource.blob.length > preview.length ? "…" : "";
        return `${header}\n[base64 ${resource.blob.length} chars; preview=${preview}${suffix}]`;
    }
    return header;
}
function formatResourceLink(content) {
    const uri = typeof content.uri === "string" ? content.uri : "unknown";
    const name = typeof content.name === "string" ? ` ${content.name}` : "";
    const mimeType = typeof content.mimeType === "string" ? `; ${content.mimeType}` : "";
    const description = typeof content.description === "string"
        ? `\n${content.description}`
        : "";
    return `[MCP resource link:${name} ${uri}${mimeType}]${description}`;
}
function formatMCPContent(content) {
    if (content.type === "text" && typeof content.text === "string")
        return content.text;
    if (content.type === "image" || content.type === "audio") {
        return formatMediaContent(content.type, content);
    }
    if (content.type === "resource")
        return formatResourceContent(content);
    if (content.type === "resource_link")
        return formatResourceLink(content);
    return `[MCP ${content.type || "content"}] ${jsonStringifyResult(content)}`;
}
function truncateUTF8(value, maxBytes) {
    const buffer = Buffer.from(value);
    if (buffer.length <= maxBytes)
        return value;
    let end = maxBytes;
    while (end > 0 && (buffer[end] & 0xc0) === 0x80)
        end -= 1;
    return buffer.subarray(0, end).toString("utf8");
}
export function serializeMCPToolResult(response) {
    const content = Array.isArray(response.content)
        ? response.content.map(formatMCPContent).filter(Boolean)
        : [];
    const structured = isRecord(response.structuredContent)
        ? `[MCP structured content]\n${jsonStringifyResult(response.structuredContent)}`
        : "";
    const fullText = [...content, structured].filter(Boolean).join("\n");
    if (Buffer.byteLength(fullText) <= MAX_MCP_RESULT_BYTES)
        return fullText;
    const suffix = "\n… [MCP result truncated]";
    return `${truncateUTF8(fullText, MAX_MCP_RESULT_BYTES - Buffer.byteLength(suffix))}${suffix}`;
}
/** Dispatch one provider-qualified MCP call to its exact connected owner. */
export async function callQualifiedMCPTool(qualifiedName, args, signal) {
    const tool = getConnectedMCPTools().find((candidate) => candidate.qualifiedName === qualifiedName);
    if (!tool) {
        return {
            success: false,
            result: `MCP Tool "${qualifiedName}" ist nicht verbunden.`,
            serverName: "",
        };
    }
    const client = activeClients.get(tool.serverName);
    if (!client?.isConnected()) {
        return {
            success: false,
            result: `MCP Server "${tool.serverName}" ist nicht verbunden.`,
            serverName: tool.serverName,
        };
    }
    try {
        const response = await client.callTool(tool.name, args, signal);
        const text = serializeMCPToolResult(response);
        return {
            success: !response.isError,
            result: text || "(no output)",
            serverName: tool.serverName,
        };
    }
    catch (error) {
        return {
            success: false,
            result: `MCP Tool Fehler: ${error.message}`,
            serverName: tool.serverName,
        };
    }
}
/**
 * Get all available MCP tools across all connected servers.
 */
export async function getAllMCPTools() {
    return getConnectedMCPTools();
}
/**
 * Check if an MCP server is connected.
 */
export function isMCPServerConnected(name) {
    return activeClients.has(name) && activeClients.get(name).isConnected();
}
/**
 * Format MCP servers display for /mcp command.
 */
export function formatMCPDisplay(settings) {
    const servers = getMCPServers(settings);
    const lines = ["MCP Servers:\n"];
    if (Object.keys(servers).length === 0) {
        lines.push("  Keine MCP Server konfiguriert.\n");
    }
    else {
        for (const [name, config] of Object.entries(servers)) {
            const connected = isMCPServerConnected(name);
            const status = connected ? "verbunden" : "nicht verbunden";
            lines.push(`  ${name} [${status}]`);
            lines.push(`    command: ${config.command}${config.args ? " " + config.args.join(" ") : ""}`);
            lines.push("");
        }
    }
    lines.push("  Befehle:");
    lines.push("    /mcp add <name> <command> [args...]  — Server hinzufuegen");
    lines.push("    /mcp remove <name>                   — Server entfernen");
    lines.push("    /mcp connect <name>                  — Server verbinden");
    lines.push("    /mcp disconnect <name>               — Server trennen");
    lines.push("    /mcp tools                           — Alle MCP-Tools anzeigen");
    lines.push("    /mcp list                            — Server anzeigen");
    return lines.join("\n");
}
//# sourceMappingURL=mcp.js.map