// ─── Web Dashboard ───────────────────────────────────────
// Optional browser-based dashboard showing session stats,
// cost tracking, conversation history, tool usage, and
// real-time streaming in a sleek dark UI.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { exec } from "node:child_process";
import { platform } from "node:os";
import { getSessionCosts, formatCostDisplay, type SessionCosts } from "./cost-tracker.js";
import { toolStats } from "./tools.js";
import { listConversations } from "./history.js";
import type { Message, CLIConfig } from "./types.js";

// ─── Types ───────────────────────────────────────────────

export interface DashboardConfig {
  port: number;
  host: string;
  cliConfig: CLIConfig;
  getMessages: () => Message[];
  getSessionStart: () => number;
}

export interface DashboardState {
  isRunning: boolean;
  port: number;
  url: string;
}

// ─── HTML Template ───────────────────────────────────────

function generateDashboardHTML(
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Morningstar Dashboard</title>
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
      ${config.model} \u00B7 Uptime: ${uptimeStr}
    </span>
  </div>

  <div class="grid">
    <!-- Session Stats -->
    <div class="card">
      <h2>Session</h2>
      <div class="stat-row"><span class="label">Model</span><span class="value">${config.model}</span></div>
      <div class="stat-row"><span class="label">Provider</span><span class="value">${config.provider || 'auto'}</span></div>
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
              <span class="tool-name">${tool}</span>
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
              <span class="label">${model}</span>
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
          <div class="msg msg-${m.role}">
            <div class="role">${m.role}</div>
            <div class="content">${escapeHtml(m.content.slice(0, 200))}${m.content.length > 200 ? '...' : ''}</div>
          </div>
        `).join("")}
      </div>
    </div>
  </div>

  <button class="refresh-btn" onclick="location.reload()">Refresh</button>

  <script>
    // Auto-refresh every 5 seconds
    setTimeout(() => location.reload(), 5000);
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Open Browser ────────────────────────────────────────

function openBrowser(url: string): void {
  const os = platform();
  const cmd = os === "darwin" ? "open"
    : os === "win32" ? "start"
    : "xdg-open"; // Linux
  try {
    exec(`${cmd} "${url}"`);
  } catch {}
}

// ─── Dashboard Server ────────────────────────────────────

/**
 * Start the web dashboard server.
 */
export async function startDashboard(
  dashConfig: DashboardConfig,
): Promise<DashboardState> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? "/").split("?")[0];

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (url === "/" || url === "/dashboard") {
      const costs = getSessionCosts();
      const html = generateDashboardHTML(
        dashConfig.cliConfig,
        costs,
        toolStats,
        dashConfig.getMessages(),
        dashConfig.getSessionStart(),
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);

    } else if (url === "/api/stats") {
      const costs = getSessionCosts();
      const data = {
        session: {
          model: dashConfig.cliConfig.model,
          provider: dashConfig.cliConfig.provider,
          uptime: Math.round((Date.now() - dashConfig.getSessionStart()) / 1000),
          messageCount: dashConfig.getMessages().length,
        },
        costs,
        tools: toolStats,
        messages: dashConfig.getMessages().filter(m => m.role !== "system").slice(-20).map(m => ({
          role: m.role,
          preview: m.content.slice(0, 200),
        })),
      };
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data, null, 2));

    } else if (url === "/api/history") {
      const convs = listConversations();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(convs, null, 2));

    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", (err: NodeJS.ErrnoException) => {
      reject(err.code === "EADDRINUSE"
        ? new Error(`Dashboard Port ${dashConfig.port} belegt`)
        : err);
    });

    server.listen(dashConfig.port, dashConfig.host, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : dashConfig.port;
      const host = dashConfig.host === "0.0.0.0" ? "localhost" : dashConfig.host;
      const url = `http://${host}:${port}`;

      // Auto-open browser
      openBrowser(`${url}/dashboard`);

      resolve({
        isRunning: true,
        port,
        url,
      });
    });
  });
}

/**
 * Format dashboard status for terminal display.
 */
export function formatDashboardStatus(state: DashboardState): string {
  if (!state.isRunning) return "  Dashboard: Nicht aktiv";
  return [
    `  Dashboard aktiv`,
    `  URL:  ${state.url}`,
    `  Port: ${state.port}`,
  ].join("\n");
}
