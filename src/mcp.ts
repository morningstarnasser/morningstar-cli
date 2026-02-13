// ─── MCP Server Management ───────────────────────────────
// Commander subcommands + runtime management for MCP servers

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { MCPClient, type MCPServerConfig, type MCPTool } from "./mcp-client.js";
import type { MorningstarSettings } from "./settings.js";

const CONFIG_DIR = join(homedir(), ".morningstar");
const SETTINGS_FILE = join(CONFIG_DIR, "settings.json");

// Runtime MCP client instances
const activeClients = new Map<string, MCPClient>();

/**
 * Get MCP server configurations from settings.
 */
export function getMCPServers(settings: MorningstarSettings): Record<string, MCPServerConfig> {
  return (settings.mcpServers as Record<string, MCPServerConfig>) || {};
}

/**
 * Add an MCP server to settings.
 */
export function addMCPServer(name: string, config: MCPServerConfig): void {
  let settings: MorningstarSettings = {};
  try {
    if (existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch {}

  if (!settings.mcpServers) settings.mcpServers = {};
  (settings.mcpServers as Record<string, MCPServerConfig>)[name] = config;

  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Remove an MCP server from settings.
 */
export function removeMCPServer(name: string): boolean {
  let settings: MorningstarSettings = {};
  try {
    if (existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch {}

  if (!settings.mcpServers || !(settings.mcpServers as Record<string, unknown>)[name]) {
    return false;
  }

  delete (settings.mcpServers as Record<string, unknown>)[name];
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  return true;
}

/**
 * Connect to an MCP server.
 */
export async function connectMCPServer(name: string, config: MCPServerConfig): Promise<MCPTool[]> {
  // Disconnect existing
  if (activeClients.has(name)) {
    await activeClients.get(name)!.disconnect();
  }

  const client = new MCPClient(config);
  await client.connect();
  activeClients.set(name, client);

  return await client.listTools();
}

/**
 * Disconnect an MCP server.
 */
export async function disconnectMCPServer(name: string): Promise<void> {
  const client = activeClients.get(name);
  if (client) {
    await client.disconnect();
    activeClients.delete(name);
  }
}

/**
 * Disconnect all MCP servers.
 */
export async function disconnectAllMCPServers(): Promise<void> {
  for (const [name, client] of activeClients) {
    try {
      await client.disconnect();
    } catch {}
    activeClients.delete(name);
  }
}

/**
 * Call an MCP tool by name.
 * Searches all connected servers for the tool.
 */
export async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result: string; serverName: string }> {
  for (const [serverName, client] of activeClients) {
    try {
      const tools = await client.listTools();
      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        const result = await client.callTool(toolName, args);
        const text = result.content
          .map(c => c.text || "")
          .filter(Boolean)
          .join("\n");
        return {
          success: !result.isError,
          result: text || "(no output)",
          serverName,
        };
      }
    } catch {}
  }

  return { success: false, result: `MCP Tool "${toolName}" not found on any connected server.`, serverName: "" };
}

/**
 * Get all available MCP tools across all connected servers.
 */
export async function getAllMCPTools(): Promise<Array<MCPTool & { serverName: string }>> {
  const allTools: Array<MCPTool & { serverName: string }> = [];

  for (const [serverName, client] of activeClients) {
    try {
      const tools = await client.listTools();
      for (const tool of tools) {
        allTools.push({ ...tool, serverName });
      }
    } catch {}
  }

  return allTools;
}

/**
 * Check if an MCP server is connected.
 */
export function isMCPServerConnected(name: string): boolean {
  return activeClients.has(name) && activeClients.get(name)!.isConnected();
}

/**
 * Format MCP servers display for /mcp command.
 */
export function formatMCPDisplay(settings: MorningstarSettings): string {
  const servers = getMCPServers(settings);
  const lines: string[] = ["MCP Servers:\n"];

  if (Object.keys(servers).length === 0) {
    lines.push("  Keine MCP Server konfiguriert.\n");
  } else {
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
