// ─── Web Dashboard ───────────────────────────────────────
// Optional browser-based dashboard showing session stats,
// cost tracking, conversation history, tool usage, and
// real-time streaming in a sleek dark UI.

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { execFile } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { platform } from "node:os";
import { getSessionCosts, type SessionCosts } from "./cost-tracker.js";
import { toolStats } from "./tools.js";
import { listConversations } from "./history.js";
import type { Message, CLIConfig } from "./types.js";

// ─── Types ───────────────────────────────────────────────

export interface DashboardConfig {
  port: number;
  host?: "127.0.0.1" | "::1";
  cliConfig: CLIConfig;
  getMessages: () => Message[];
  getSessionStart: () => number;
  openBrowser?: boolean;
}

export interface DashboardState {
  isRunning: boolean;
  port: number;
  url: string;
  accessUrl: string;
  stop: () => Promise<void>;
}

type DashboardHost = NonNullable<DashboardConfig["host"]>;

const DEFAULT_DASHBOARD_HOST: DashboardHost = "127.0.0.1";
const SESSION_COOKIE = "morningstar_dashboard_session";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src data:",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

const DASHBOARD_MESSAGE_ROLES = new Set([
  "assistant",
  "system",
  "tool",
  "user",
]);

function normalizeMessageRole(role: string): string {
  return DASHBOARD_MESSAGE_ROLES.has(role) ? role : "unknown";
}

// ─── HTML Template ───────────────────────────────────────

export function generateDashboardHTML(
  config: CLIConfig,
  costs: SessionCosts,
  stats: typeof toolStats,
  messages: Message[],
  sessionStart: number,
): string {
  const uptime = Math.round((Date.now() - sessionStart) / 1000);
  const uptimeStr = uptime >= 3600
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : uptime >= 60
      ? `${Math.floor(uptime / 60)}m ${uptime % 60}s`
      : `${uptime}s`;

  // Filter out system messages (contain system prompt — never show in dashboard)
  const visibleMessages = messages.filter(m => m.role !== "system");
  const userMsgs = visibleMessages.filter(m => m.role === "user").length;
  const aiMsgs = visibleMessages.filter(m => m.role === "assistant").length;
  const toolEntries = Object.entries(stats.byTool).sort((a, b) => b[1] - a[1]);
  const modelEntries = Object.entries(costs.byModel);
  const modelName = escapeHtml(String(config.model ?? ""));
  const providerName = escapeHtml(String(config.provider || "auto"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Morningstar Dashboard</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23f59e0b'/%3E%3Cstop offset='50%25' stop-color='%23ec4899'/%3E%3Cstop offset='100%25' stop-color='%23a855f7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='%230a0a0a'/%3E%3Cpath d='M32 6 L38.5 22.5 L56 22.5 L42 33.5 L47 50.5 L32 40 L17 50.5 L22 33.5 L8 22.5 L25.5 22.5 Z' fill='url(%23g)'/%3E%3C/svg%3E">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
      border-bottom: 1px solid #f59e0b33;
      padding: 20px 32px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header .star { color: #f59e0b; font-size: 28px; }
    .header h1 { color: #f59e0b; font-size: 20px; font-weight: 700; letter-spacing: 0.1em; }
    .header .meta { color: #666; font-size: 12px; margin-left: auto; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      padding: 24px 32px;
    }
    .card {
      background: #111;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 20px;
      transition: border-color 0.2s;
    }
    .card:hover { border-color: #f59e0b44; }
    .card h2 {
      color: #f59e0b;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      margin-bottom: 12px;
    }
    .stat-value { font-size: 28px; font-weight: 700; color: #fff; }
    .stat-label { font-size: 11px; color: #666; margin-top: 4px; }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #1a1a1a;
      font-size: 13px;
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-row .label { color: #888; }
    .stat-row .value { color: #fff; font-weight: 600; }
    .bar-container {
      width: 100%;
      height: 8px;
      background: #1a1a1a;
      border-radius: 4px;
      margin-top: 8px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .tool-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background: #0d0d0d;
      border-radius: 8px;
      font-size: 12px;
    }
    .tool-name { color: #06b6d4; font-weight: 600; }
    .tool-count { color: #888; }
    .messages-list {
      max-height: 400px;
      overflow-y: auto;
      font-size: 12px;
    }
    .msg {
      padding: 8px 12px;
      border-bottom: 1px solid #1a1a1a;
      line-height: 1.5;
    }
    .msg-user { color: #06b6d4; }
    .msg-assistant { color: #10b981; }
    .msg-system { color: #666; }
    .msg .role {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #555;
      margin-bottom: 2px;
    }
    .msg .content {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 60px;
      overflow: hidden;
    }
    .refresh-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #f59e0b;
      color: #000;
      border: none;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    .refresh-btn:hover { background: #d97706; }
    .wide { grid-column: span 2; }
    @media (max-width: 640px) { .wide { grid-column: span 1; } .grid { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <span class="star">\u2605</span>
    <h1>MORNINGSTAR</h1>
    <span style="color:#666;font-size:12px;">Dashboard</span>
    <span class="meta">
      ${modelName} \u00B7 Uptime: ${uptimeStr}
    </span>
  </div>

  <div class="grid">
    <!-- Session Stats -->
    <div class="card">
      <h2>Session</h2>
      <div class="stat-row"><span class="label">Model</span><span class="value">${modelName}</span></div>
      <div class="stat-row"><span class="label">Provider</span><span class="value">${providerName}</span></div>
      <div class="stat-row"><span class="label">Uptime</span><span class="value">${uptimeStr}</span></div>
      <div class="stat-row"><span class="label">Messages</span><span class="value">${messages.length}</span></div>
      <div class="stat-row"><span class="label">User / AI</span><span class="value">${userMsgs} / ${aiMsgs}</span></div>
    </div>

    <!-- Cost Tracking -->
    <div class="card">
      <h2>Cost Tracking</h2>
      <div class="stat-value">$${costs.totalCost.toFixed(4)}</div>
      <div class="stat-label">Total session cost</div>
      <div style="margin-top:12px">
        <div class="stat-row"><span class="label">Input Tokens</span><span class="value">${costs.totalInput.toLocaleString()}</span></div>
        <div class="stat-row"><span class="label">Output Tokens</span><span class="value">${costs.totalOutput.toLocaleString()}</span></div>
        <div class="stat-row"><span class="label">API Calls</span><span class="value">${costs.messages}</span></div>
      </div>
    </div>

    <!-- Tool Usage -->
    <div class="card">
      <h2>Tool Usage (${stats.calls} total)</h2>
      <div class="tool-grid">
        ${toolEntries.length > 0
          ? toolEntries.map(([tool, count]) => `
            <div class="tool-item">
              <span class="tool-name">${escapeHtml(tool)}</span>
              <span class="tool-count">${count}</span>
            </div>
          `).join("")
          : '<div class="tool-item"><span class="tool-name">No tools used yet</span><span></span></div>'
        }
      </div>
      <div style="margin-top:12px;font-size:12px;color:#666">
        Files: ${stats.filesRead}r ${stats.filesWritten}w ${stats.filesEdited}e ${stats.filesDeleted}d \u00B7 Bash: ${stats.bashCommands}
      </div>
    </div>

    <!-- Model Costs Breakdown -->
    <div class="card">
      <h2>Per-Model Costs</h2>
      ${modelEntries.length > 0
        ? modelEntries.map(([model, data]) => {
          const pct = costs.totalCost > 0 ? (data.cost / costs.totalCost * 100) : 0;
          return `
            <div class="stat-row">
              <span class="label">${escapeHtml(model)}</span>
              <span class="value">$${data.cost.toFixed(4)} (${data.count}x)</span>
            </div>
            <div class="bar-container">
              <div class="bar-fill" style="width:${pct}%;background:#f59e0b"></div>
            </div>
          `;
        }).join("")
        : '<div class="stat-row"><span class="label">No data</span><span class="value">-</span></div>'
      }
    </div>

    <!-- Conversation -->
    <div class="card wide">
      <h2>Conversation (${visibleMessages.length} messages)</h2>
      <div class="messages-list">
        ${visibleMessages.slice(-20).map(m => `
          <div class="msg msg-${normalizeMessageRole(m.role)}">
            <div class="role">${escapeHtml(normalizeMessageRole(m.role))}</div>
            <div class="content">${escapeHtml(m.content.slice(0, 200))}${m.content.length > 200 ? '...' : ''}</div>
          </div>
        `).join("")}
      </div>
    </div>
  </div>

  <form method="get" action="/dashboard">
    <button class="refresh-btn" type="submit">Refresh</button>
  </form>
</body>
</html>`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Open Browser ────────────────────────────────────────

function openBrowser(url: string): void {
  const os = platform();
  const command = os === "win32" ? "cmd"
    : os === "darwin" ? "open"
    : "xdg-open";
  const args = os === "win32"
    ? ["/c", "start", "", url]
    : [url];
  execFile(command, args, { windowsHide: true }, () => {});
}

// ─── Dashboard Server ────────────────────────────────────

function applySecurityHeaders(res: ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

function sendResponse(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): void {
  applySecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": contentType,
    ...headers,
  });
  res.end(body);
}

function secretsEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

function hasSessionCookie(req: IncomingMessage, token: string): boolean {
  return (req.headers.cookie ?? "").split(";").some((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return false;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return name === SESSION_COOKIE && secretsEqual(value, token);
  });
}

function validateRequestContext(
  req: IncomingMessage,
  expectedOrigin: string,
): { status: number; message: string } | null {
  const expectedHost = new URL(expectedOrigin).host.toLowerCase();
  const requestHost = (req.headers.host ?? "").trim().toLowerCase();
  if (requestHost !== expectedHost) {
    return { status: 421, message: "Misdirected Request" };
  }

  const requestOrigin = req.headers.origin;
  if (requestOrigin && requestOrigin !== expectedOrigin) {
    return { status: 403, message: "Forbidden" };
  }
  return null;
}

function sendDashboardPage(
  res: ServerResponse,
  dashConfig: DashboardConfig,
): void {
  const html = generateDashboardHTML(
    dashConfig.cliConfig,
    getSessionCosts(),
    toolStats,
    dashConfig.getMessages(),
    dashConfig.getSessionStart(),
  );
  sendResponse(res, 200, "text/html; charset=utf-8", html);
}

function sendDashboardStats(
  res: ServerResponse,
  dashConfig: DashboardConfig,
): void {
  const data = {
    session: {
      model: dashConfig.cliConfig.model,
      provider: dashConfig.cliConfig.provider,
      uptime: Math.round((Date.now() - dashConfig.getSessionStart()) / 1000),
      messageCount: dashConfig.getMessages().length,
    },
    costs: getSessionCosts(),
    tools: toolStats,
    messages: dashConfig.getMessages()
      .filter(m => m.role !== "system")
      .slice(-20)
      .map(m => ({ role: m.role, preview: m.content.slice(0, 200) })),
  };
  sendResponse(
    res,
    200,
    "application/json; charset=utf-8",
    JSON.stringify(data, null, 2),
  );
}

function isDashboardPage(pathname: string): boolean {
  return pathname === "/" || pathname === "/dashboard";
}

function tryDashboardBootstrap(
  requestUrl: URL,
  res: ServerResponse,
  sessionToken: string,
): boolean {
  const bootstrapToken = requestUrl.searchParams.get("token");
  if (!isDashboardPage(requestUrl.pathname) || bootstrapToken === null) {
    return false;
  }
  if (!secretsEqual(bootstrapToken, sessionToken)) {
    sendResponse(res, 401, "text/plain; charset=utf-8", "Unauthorized");
    return true;
  }
  sendResponse(res, 303, "text/plain; charset=utf-8", "See Other", {
    Location: "/dashboard",
    "Set-Cookie": [
      `${SESSION_COOKIE}=${sessionToken}`,
      "HttpOnly",
      "SameSite=Strict",
      "Path=/",
      `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ].join("; "),
  });
  return true;
}

function routeAuthorizedRequest(
  requestUrl: URL,
  res: ServerResponse,
  dashConfig: DashboardConfig,
): void {
  if (isDashboardPage(requestUrl.pathname)) {
    sendDashboardPage(res, dashConfig);
  } else if (requestUrl.pathname === "/api/stats") {
    sendDashboardStats(res, dashConfig);
  } else if (requestUrl.pathname === "/api/history") {
    sendResponse(
      res,
      200,
      "application/json; charset=utf-8",
      JSON.stringify(listConversations(), null, 2),
    );
  } else {
    sendResponse(res, 404, "text/plain; charset=utf-8", "Not Found");
  }
}

function parseRequestUrl(rawUrl: string | undefined, expectedOrigin: string): URL | null {
  try {
    return new URL(rawUrl ?? "/", expectedOrigin);
  } catch {
    return null;
  }
}

function handleDashboardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dashConfig: DashboardConfig,
  expectedOrigin: string,
  sessionToken: string,
): void {
  if (req.method !== "GET") {
    sendResponse(res, 405, "text/plain; charset=utf-8", "Method Not Allowed", {
      Allow: "GET",
    });
    return;
  }

  const contextError = validateRequestContext(req, expectedOrigin);
  if (contextError) {
    sendResponse(
      res,
      contextError.status,
      "text/plain; charset=utf-8",
      contextError.message,
    );
    return;
  }

  const requestUrl = parseRequestUrl(req.url, expectedOrigin);
  if (!requestUrl) {
    sendResponse(res, 400, "text/plain; charset=utf-8", "Bad Request");
    return;
  }
  if (requestUrl.origin !== expectedOrigin) {
    sendResponse(res, 421, "text/plain; charset=utf-8", "Misdirected Request");
    return;
  }
  if (tryDashboardBootstrap(requestUrl, res, sessionToken)) return;
  if (!hasSessionCookie(req, sessionToken)) {
    sendResponse(res, 401, "text/plain; charset=utf-8", "Unauthorized");
    return;
  }
  routeAuthorizedRequest(requestUrl, res, dashConfig);
}

function resolveDashboardHost(host: string | undefined): DashboardHost {
  const candidate = host ?? DEFAULT_DASHBOARD_HOST;
  if (candidate === "127.0.0.1" || candidate === "::1") return candidate;
  throw new Error("Dashboard darf nur an eine Loopback-Adresse gebunden werden");
}

function formatDashboardOrigin(host: DashboardHost, port: number): string {
  const urlHost = host === "::1" ? "[::1]" : host;
  return `http://${urlHost}:${port}`;
}

function createDashboardServer(
  dashConfig: DashboardConfig,
  host: DashboardHost,
  sessionToken: string,
): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const address = server.address();
    if (!address || typeof address === "string") {
      sendResponse(res, 503, "text/plain; charset=utf-8", "Unavailable");
      return;
    }
    const origin = formatDashboardOrigin(host, address.port);
    try {
      handleDashboardRequest(req, res, dashConfig, origin, sessionToken);
    } catch {
      if (!res.headersSent) {
        sendResponse(res, 500, "text/plain; charset=utf-8", "Internal Error");
      } else {
        res.destroy();
      }
    }
  });
  return server;
}

function listenDashboardServer(
  server: Server,
  port: number,
  host: DashboardHost,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      reject(error.code === "EADDRINUSE"
        ? new Error(`Dashboard Port ${port} belegt`)
        : error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function stopDashboardServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => error ? reject(error) : resolve());
  });
}

/**
 * Start the web dashboard server.
 */
export async function startDashboard(
  dashConfig: DashboardConfig,
): Promise<DashboardState> {
  const host = resolveDashboardHost(dashConfig.host);
  const sessionToken = randomBytes(32).toString("base64url");
  const server = createDashboardServer(dashConfig, host, sessionToken);
  await listenDashboardServer(server, dashConfig.port, host);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Dashboard konnte seine Adresse nicht bestimmen");
  }
  const url = formatDashboardOrigin(host, address.port);
  const accessUrl =
    `${url}/dashboard?token=${encodeURIComponent(sessionToken)}`;
  if (dashConfig.openBrowser !== false) openBrowser(accessUrl);

  return {
    get isRunning() {
      return server.listening;
    },
    port: address.port,
    url,
    accessUrl,
    stop: () => stopDashboardServer(server),
  };
}

/**
 * Format dashboard status for terminal display.
 */
export function formatDashboardStatus(state: DashboardState): string {
  if (!state.isRunning) return "  Dashboard: Nicht aktiv";
  return [
    `  Dashboard aktiv`,
    `  URL:  ${state.accessUrl}`,
    `  Port: ${state.port}`,
  ].join("\n");
}
