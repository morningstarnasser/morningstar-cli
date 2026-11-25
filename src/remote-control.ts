import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { RemoteTimelineEntry } from "./remote-timeline.js";
import { remoteHTML, remoteScript, remoteCSS } from "./remote-page.js";

export interface RemoteAction { type: "message" | "stop" | "approve" | "new" | "resume" | "rename"; id: string; text?: string; sessionId?: string; approvalId?: string; allow?: boolean }
export interface RemoteSnapshot {
  revision?: number;
  id: string; name: string; model: string; project: string; busy: boolean; stream: string;
  messages: { role: string; content: string }[];
  timeline?: RemoteTimelineEntry[];
  agents: { taskId: string; agentId: string; status: string; detail: string; elapsedMs: number }[];
  work: { agent: string; heading: string; success: boolean; output: string; change?: { added: number; removed: number; lines: { kind: string; text: string; line: number }[] } }[];
  approval: { id: string; tool: string; target: string; reason: string } | null;
}
export interface RemoteOptions {
  host?: string; port?: number;
  snapshot: () => RemoteSnapshot;
  sessions: () => { id: string; name: string; savedAt: string; messageCount: number }[];
  action: (action: RemoteAction) => void | Promise<void>;
  now?: () => number;
}
export interface RemoteControl {
  url: string; host: string; port: number; running: boolean;
  pair: () => { url: string; expiresAt: number };
  stop: () => Promise<void>;
}

export function privateAddress(host: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const n = host.split(".").map(Number);
  return n.length === 4 && n.every(v => Number.isInteger(v) && v >= 0 && v <= 255)
    && (n[0] === 127 || n[0] === 10 || n[0] === 192 && n[1] === 168 || n[0] === 172 && n[1] >= 16 && n[1] <= 31 || n[0] === 100 && n[1] >= 64 && n[1] <= 127);
}
export function remoteAddress(mode = "auto"): { host: string; label: string } {
  if (mode === "local") return { host: "127.0.0.1", label: "Dieser Rechner" };
  const addresses = Object.values(networkInterfaces()).flat().filter(a => a?.family === "IPv4" && !a.internal).map(a => a!.address);
  const tail = addresses.find(a => /^100\./.test(a) && privateAddress(a));
  if (mode !== "lan" && tail) return { host: tail, label: "Tailscale · auch unterwegs" };
  const lan = addresses.find(a => !a.startsWith("100.") && privateAddress(a));
  if (lan) return { host: lan, label: "Gleiches WLAN · lokale HTTP-Verbindung" };
  return { host: "127.0.0.1", label: "Nur dieser Rechner · kein privates Netzwerk gefunden" };
}
const equal = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const token = () => randomBytes(32).toString("base64url");
const headers = {
  "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Cross-Origin-Resource-Policy": "same-origin", "Cross-Origin-Opener-Policy": "same-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new Error("JSON erforderlich");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size <= 65536) chunks.push(bytes); }
  if (size > 65536) throw new Error("Anfrage zu gross");
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON-Objekt erforderlich");
  return value;
}
export function remoteAction(raw: Record<string, unknown>): RemoteAction {
  const fields: Record<string, string[]> = { message: ["text"], stop: [], approve: ["approvalId", "allow"], new: [], resume: ["sessionId"], rename: ["text"] };
  if (typeof raw.type !== "string" || !Object.hasOwn(fields, raw.type) || typeof raw.id !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(raw.id)) throw new Error("Ungültige Aktion");
  if (Object.keys(raw).some(k => !["id", "type", ...fields[raw.type as string]].includes(k))) throw new Error("Unbekanntes Feld");
  if (["message", "rename"].includes(raw.type) && (typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > (raw.type === "rename" ? 120 : 32000))) throw new Error("Ungültiger Text");
  if (raw.type === "resume" && (typeof raw.sessionId !== "string" || !/^[a-z0-9-]{1,64}$/.test(raw.sessionId))) throw new Error("Ungültige Sitzung");
  if (raw.type === "approve" && (typeof raw.approvalId !== "string" || raw.approvalId.length > 80 || typeof raw.allow !== "boolean")) throw new Error("Ungültige Freigabe");
  return raw as unknown as RemoteAction;
}

export async function startRemoteControl(options: RemoteOptions): Promise<RemoteControl> {
  const host = options.host ?? "127.0.0.1";
  if (!privateAddress(host)) throw new Error("Remote Control bindet nur an private IPv4-Adressen.");
  const markdownScript = readFileSync(join(dirname(createRequire(import.meta.url).resolve("marked")), "marked.umd.js"), "utf8");
  const now = options.now ?? Date.now;
  let pairing = "", pairingExpiry = 0;
  const sessions = new Map<string, number>(), attempts = new Map<string, { count: number; until: number }>(), actions = new Map<string, number>();
  let origin = "", cookieName = "";
  const json = (res: ServerResponse, status: number, value: unknown) => { res.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); };
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(origin).host) { json(res, 403, { error: "Host abgelehnt" }); return; }
      const url = new URL(req.url ?? "/", origin);
      if (url.search) { json(res, 400, { error: "Query-Parameter nicht erlaubt" }); return; }
      if (req.method === "GET" && ["/", "/app.js", "/app.css", "/markdown.js"].includes(url.pathname)) {
        res.writeHead(200, { ...headers, "Content-Type": url.pathname === "/" ? "text/html; charset=utf-8" : url.pathname.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8" });
        res.end(url.pathname === "/" ? remoteHTML : url.pathname === "/markdown.js" ? markdownScript : url.pathname.endsWith(".js") ? remoteScript : remoteCSS); return;
      }
      if (req.method === "POST" && req.headers.origin !== origin) { json(res, 403, { error: "Origin abgelehnt" }); return; }
      if (req.method === "POST" && url.pathname === "/api/pair") {
        const ip = req.socket.remoteAddress ?? "unknown";
        const rate = attempts.get(ip);
        if (rate && rate.until > now() && rate.count >= 5) { res.setHeader("Retry-After", "60"); json(res, 429, { error: "Zu viele Versuche. In einer Minute erneut versuchen." }); return; }
        if (attempts.size > 128) attempts.clear();
        attempts.set(ip, { count: rate && rate.until > now() ? rate.count + 1 : 1, until: now() + 60000 });
        const data = await body(req);
        if (Object.keys(data).length !== 1 || typeof data.token !== "string" || !pairing || now() >= pairingExpiry || !equal(data.token, pairing)) { json(res, 401, { error: "QR-Code ungültig, benutzt oder abgelaufen. Am Rechner /rc ausführen." }); return; }
        pairing = ""; attempts.delete(ip);
        for (const [id, expires] of sessions) if (expires < now()) sessions.delete(id);
        if (sessions.size >= 4) sessions.delete(sessions.keys().next().value!);
        const secret = token(); sessions.set(secret, now() + 12 * 3600000);
        res.setHeader("Set-Cookie", `${cookieName}=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
        json(res, 200, { paired: true }); return;
      }
      const auth = req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(cookieName + "="))?.slice(cookieName.length + 1) ?? "";
      const valid = [...sessions].some(([id, expires]) => expires > now() && equal(id, auth));
      if (!valid) { json(res, 401, { error: "Nicht verbunden. Am Rechner /rc ausführen und QR-Code scannen." }); return; }
      if (req.method === "GET" && url.pathname === "/api/state") {
        const state = options.snapshot();
        const payload = JSON.stringify(state), hash = createHash("sha256").update(payload).digest("hex");
        res.setHeader("ETag", hash);
        if (req.headers["if-none-match"] === hash) { res.writeHead(304, headers); res.end(); return; }
        json(res, 200, state); return;
      }
      if (req.method === "GET" && url.pathname === "/api/sessions") { json(res, 200, options.sessions().slice(0, 100)); return; }
      if (req.method === "POST" && url.pathname === "/api/action") {
        const action = remoteAction(await body(req));
        if (actions.has(action.id)) { json(res, 200, { accepted: true, duplicate: true }); return; }
        actions.set(action.id, now());
        if (actions.size > 256) actions.delete(actions.keys().next().value!);
        try { await options.action(action); } catch (error) { actions.delete(action.id); throw error; }
        json(res, 200, { accepted: true }); return;
      }
      json(res, 404, { error: "Nicht gefunden" });
    } catch (error) { if (!res.headersSent) json(res, 400, { error: error instanceof Error ? error.message : "Anfrage fehlgeschlagen" }); else res.end(); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(options.port ?? 0, host, resolve); });
  const port = (server.address() as { port: number }).port;
  origin = `http://${host}:${port}`; cookieName = `morningstar_rc_${port}`;
  const state: RemoteControl = { host, port, url: origin, running: true,
    pair() { pairing = token(); pairingExpiry = now() + 600000; return { url: `${origin}/#pair=${pairing}`, expiresAt: pairingExpiry }; },
    async stop() { state.running = false; pairing = ""; sessions.clear(); actions.clear(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
  return state;
}
