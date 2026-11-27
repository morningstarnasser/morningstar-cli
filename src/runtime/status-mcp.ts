import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

export interface StatusTarget { label: string; url: string }
export type StatusTargets = Record<string, StatusTarget>;

/** Report transport failures without exposing URLs, credentials or raw causes. */
function connectionError(error: unknown): Error {
  const cause = error instanceof Error ? error.cause : undefined;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  let message = "Verbindung zum Status-Endpunkt fehlgeschlagen. Netzwerk und Endpunkt prüfen.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    message = `DNS-Auflösung des Status-Endpunkts fehlgeschlagen (${code}). Netzwerk/VPN und DNS prüfen.`;
  } else if (code === "ECONNREFUSED") {
    message = "Verbindung zum Status-Endpunkt abgewiesen (ECONNREFUSED). Dienst und Port prüfen.";
  } else if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || (error instanceof Error && error.name === "TimeoutError")) {
    message = "Zeitüberschreitung beim Status-Endpunkt. Netzwerk/VPN und Erreichbarkeit prüfen.";
  } else if (typeof code === "string" && /^(?:ERR_TLS_|CERT_|DEPTH_ZERO_SELF_SIGNED_CERT$|SELF_SIGNED_CERT_IN_CHAIN$|UNABLE_TO_VERIFY_LEAF_SIGNATURE$)/.test(code)) {
    message = "TLS-Prüfung des Status-Endpunkts fehlgeschlagen. Zertifikat und Systemzeit prüfen.";
  }
  return new Error(message);
}

/** Derived display values use the endpoint's explicit units. Keep raw data intact
 * so the model can cite measurements without mentally converting large numbers. */
export function statusDisplay(data: Record<string, unknown>): Record<string, string | number> {
  const display: Record<string, string | number> = {};
  const seconds = data.uptime_seconds;
  if (typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds >= 0) {
    const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
    display.uptime = `${days} ${days === 1 ? "Tag" : "Tage"}, ${hours} ${hours === 1 ? "Stunde" : "Stunden"}, ${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;
  }
  const used = data.mem_used_gb, total = data.mem_total_gb;
  if (typeof used === "number" && typeof total === "number" && Number.isFinite(used) && Number.isFinite(total) && used >= 0 && total > 0 && used <= total) {
    display.memory_used_percent = Math.round(used / total * 1000) / 10;
  }
  return display;
}

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
  const response = await fetch(target.url, { redirect: "error", signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } }).catch(error => { throw connectionError(error); });
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
  return { entity: args.entity, label: target.label, source: target.url, observed_at: new Date().toISOString(), data, display: statusDisplay(data as Record<string, unknown>) };
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
      result = { tools: [{ name: "entity_status", description: `Live-Messwerte von ${Object.entries(targets).map(([key, target]) => `${key} (${target.label})`).join(", ")}. Nur lesend. Liefert echte Werte mit Zeitstempel und berechnete Anzeigewerte unter display; diese unverändert übernehmen, insbesondere Laufzeit und RAM-Prozent. Keine vollständige Dienstebewertung; andere Hosts sind nicht angebunden.`, inputSchema: { type: "object", properties: { entity: { type: "string", enum: Object.keys(targets) } }, required: ["entity"], additionalProperties: false } }] };
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
