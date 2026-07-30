import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import {
  generateDashboardHTML,
  startDashboard,
} from "../src/web-dashboard.js";
import type { SessionCosts } from "../src/cost-tracker.js";
import type { CLIConfig, Message } from "../src/types.js";
import { toolStats } from "../src/tools.js";

interface DashboardResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

function requestDashboard(
  url: string,
  options: {
    method?: string;
    headers?: Readonly<Record<string, string>>;
  } = {},
): Promise<DashboardResponse> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: target.hostname,
      port: Number(target.port),
      path: `${target.pathname}${target.search}`,
      method: options.method ?? "GET",
      headers: options.headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function createConfig(overrides: Partial<CLIConfig> = {}): CLIConfig {
  return {
    apiKey: "",
    baseUrl: "http://127.0.0.1",
    maxTokens: 1024,
    model: "test-model",
    provider: "test-provider",
    temperature: 0,
    ...overrides,
  };
}

test("dashboard HTML escapes every dynamic label and message", () => {
  const attack = `<img src=x onerror="alert('x')">`;
  const costs: SessionCosts = {
    totalInput: 1,
    totalOutput: 1,
    totalCost: 1,
    messages: 1,
    byModel: {
      [attack]: { input: 1, output: 1, cost: 1, count: 1 },
    },
  };
  const stats: typeof toolStats = {
    calls: 1,
    byTool: { [attack]: 1 },
    filesRead: 0,
    filesWritten: 0,
    filesEdited: 0,
    filesDeleted: 0,
    bashCommands: 0,
  };
  const messages = [
    { role: "user", content: attack },
    { role: `"><script>alert(1)</script>` as Message["role"], content: attack },
  ];

  const html = generateDashboardHTML(
    createConfig({ model: attack, provider: attack }),
    costs,
    stats,
    messages,
    Date.now(),
  );

  assert.equal(html.includes(attack), false);
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("msg-\"><script>"), false);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(&#39;x&#39;\)&quot;&gt;/);
  assert.match(html, /msg-unknown/);
});

test("dashboard rejects non-loopback bind addresses at runtime", async () => {
  await assert.rejects(
    startDashboard({
      port: 0,
      host: "0.0.0.0" as never,
      cliConfig: createConfig(),
      getMessages: () => [],
      getSessionStart: Date.now,
      openBrowser: false,
    }),
    /Loopback-Adresse/,
  );
});

test("dashboard is loopback-only and requires its HttpOnly session", async () => {
  const systemSecret = "SYSTEM-SECRET-MUST-NOT-LEAK";
  const messages: Message[] = [
    { role: "system", content: systemSecret },
    { role: "user", content: "hello" },
    { role: "assistant", content: "world" },
  ];
  const state = await startDashboard({
    port: 0,
    cliConfig: createConfig(),
    getMessages: () => messages,
    getSessionStart: () => Date.now() - 1000,
    openBrowser: false,
  });

  try {
    assert.match(state.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(state.accessUrl, /^http:\/\/127\.0\.0\.1:\d+\/dashboard\?token=/);

    const unauthorized = await requestDashboard(`${state.url}/api/stats`);
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers["access-control-allow-origin"], undefined);
    assert.equal(unauthorized.headers["x-content-type-options"], "nosniff");
    assert.equal(unauthorized.headers["x-frame-options"], "DENY");
    assert.equal(unauthorized.headers["referrer-policy"], "no-referrer");
    assert.match(
      String(unauthorized.headers["content-security-policy"]),
      /default-src 'none'/,
    );

    const bootstrap = await requestDashboard(state.accessUrl);
    assert.equal(bootstrap.status, 303);
    assert.equal(bootstrap.headers.location, "/dashboard");
    assert.equal(bootstrap.headers.location?.includes("token"), false);
    const setCookie = bootstrap.headers["set-cookie"]?.[0] ?? "";
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    const cookie = setCookie.split(";")[0];
    assert.match(cookie, /^morningstar_dashboard_session=/);

    const dashboard = await requestDashboard(`${state.url}/dashboard`, {
      headers: { Cookie: cookie },
    });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.includes(systemSecret), false);
    assert.match(dashboard.body, /hello/);
    assert.equal(dashboard.headers["access-control-allow-origin"], undefined);

    const stats = await requestDashboard(`${state.url}/api/stats`, {
      headers: { Cookie: cookie },
    });
    assert.equal(stats.status, 200);
    assert.equal(stats.body.includes(systemSecret), false);
    assert.deepEqual(
      JSON.parse(stats.body).messages.map((message: Message) => message.role),
      ["user", "assistant"],
    );

    const reboundHost = await requestDashboard(`${state.url}/api/stats`, {
      headers: { Cookie: cookie, Host: "attacker.example" },
    });
    assert.equal(reboundHost.status, 421);

    const crossOrigin = await requestDashboard(`${state.url}/api/stats`, {
      headers: { Cookie: cookie, Origin: "https://attacker.example" },
    });
    assert.equal(crossOrigin.status, 403);
  } finally {
    await state.stop();
  }

  assert.equal(state.isRunning, false);
});
