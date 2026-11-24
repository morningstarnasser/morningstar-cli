import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

export interface StatusTarget { label: string; url: string }
export type StatusTargets = Record<string, StatusTarget>;

/** URLs come only from an operator-owned file, never from tool arguments. */
export function parseStatusTargets(value: unknown): StatusTargets {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Status-Konfiguration muss ein Objekt sein.");
  const targets: StatusTargets = Object.create(null) as StatusTargets;
  for (const [key, entry] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(key) || !entry || typeof entry !== "object") throw new Error("Ungültiges Status-Ziel.");
    const { label, url } = entry as Partial<StatusTarget>;
    if (typeof label !== "string" || !label.trim() || label.length > 120 || typeof url !== "string") throw new Error("Status-Ziel braucht label und url.");
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error("Ungültige Status-URL.");
    targets[key] = { label, url: parsed.href };
  }
  if (!Object.keys(targets).length || Object.keys(targets).length > 32) throw new Error("1 bis 32 Status-Ziele erforderlich.");
  return targets;
}

export async function readEntityStatus(targets: StatusTargets, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (Object.keys(args).some(key => key !== "entity") || typeof args.entity !== "string" || !Object.hasOwn(targets, args.entity)) {
    throw new Error(`Kein Status-Zugang für dieses Ziel konfiguriert. Verfügbar: ${Object.keys(targets).join(", ")}.`);
  }
  const target = targets[args.entity];
  const response = await fetch(target.url, { redirect: "error", signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Status-Endpunkt antwortet mit HTTP ${response.status}.`);
  if (!response.body) throw new Error("Leere Status-Antwort.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 64_000) throw new Error("Status-Antwort überschreitet 64 KB.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Status-Endpunkt lieferte kein JSON-Objekt.");
  return { entity: args.entity, label: target.label, source: target.url, observed_at: new Date().toISOString(), data };
}

/** Small stdio MCP adapter for existing read-only JSON monitoring endpoints. */
export async function serveStatusMCP(configPath?: string): Promise<void> {
  if (!configPath) throw new Error("Usage: morningstar status-mcp <operator-config.json>");
  const source = readFileSync(configPath, "utf8");
  if (Buffer.byteLength(source) > 64_000) throw new Error("Status-Konfiguration zu groß.");
  const targets = parseStatusTargets(JSON.parse(source));
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (Buffer.byteLength(line) > 64_000) throw new Error("MCP-Anfrage zu groß.");
    let request: { id?: number | string; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    try { request = JSON.parse(line); } catch { continue; }
    if (!request || request.id === undefined) continue;
    let result: unknown;
    if (request.method === "initialize") {
      result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "morningstar-status", version: "1.0.0" } };
    } else if (request.method === "tools/list") {
      result = { tools: [{ name: "entity_status", description: `Live-Messwerte von ${Object.entries(targets).map(([key, target]) => `${key} (${target.label})`).join(", ")}. Nur lesend. Liefert echte Werte mit Zeitstempel; andere Hosts sind nicht angebunden.`, inputSchema: { type: "object", properties: { entity: { type: "string", enum: Object.keys(targets) } }, required: ["entity"], additionalProperties: false } }] };
    } else if (request.method === "tools/call") {
      try {
        if (request.params?.name !== "entity_status") throw new Error("Unbekanntes Status-Tool.");
        const args = request.params.arguments;
        if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Argumente müssen ein Objekt sein.");
        const data = await readEntityStatus(targets, args);
        result = { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
      } catch (error) {
        result = { isError: true, content: [{ type: "text", text: `Live-Status nicht verfügbar: ${(error as Error).message}` }] };
      }
    } else if (request.method === "ping") result = {};
    else {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } }) + "\n");
      continue;
    }
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
  }
}
