import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Message } from "../types.js";
import type { StreamToken } from "../providers.js";

const exec = promisify(execFile);
const DENY = [{ action: "*", resource: "*", effect: "deny" }];

function executable(): string {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  const local = join(homedir(), ".local", "bin", process.platform === "win32" ? "opencode.exe" : "opencode");
  return existsSync(local) ? local : "opencode";
}

/** OpenCode's official CLI owns access to its free tier. No client impersonation. */
export function isOpenCodeFreeModel(id: string): boolean {
  return /^opencode\/[a-z0-9][a-z0-9._-]*(?:-free)$/.test(id) || id === "opencode/big-pickle";
}

function isolatedRuntime(system: string): { root: string; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(join(tmpdir(), "morningstar-opencode-"));
  const config = join(root, "opencode.json");
  writeFileSync(config, JSON.stringify({
    update: "disable", share: "disabled", instructions: [], permissions: DENY,
    agents: { morningstar: { mode: "primary", system, steps: 1, permissions: DENY } },
  }), { mode: 0o600 });
  // Do not inherit vendor credentials, project configuration or plugins.
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  for (const name of ["config", "data", "state", "cache"]) mkdirSync(join(root, name));
  Object.assign(env, {
    HOME: root, USERPROFILE: root, XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    XDG_CACHE_HOME: join(root, "cache"), OPENCODE_CONFIG: config,
    OPENCODE_DISABLE_PROJECT_CONFIG: "1", NO_COLOR: "1",
  });
  return { root, env };
}

export async function discoverOpenCodeModels(): Promise<string[]> {
  const runtime = isolatedRuntime("Return text only. Tools are managed by Morningstar.");
  try {
    const { stdout } = await exec(executable(), ["models", "--standalone"], {
      cwd: runtime.root, env: runtime.env, timeout: 15_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    });
    return [...new Set(stdout.split(/\r?\n/).map(line => line.trim()).filter(isOpenCodeFreeModel))];
  } finally { rmSync(runtime.root, { recursive: true, force: true, maxRetries: 3 }); }
}

export function parseOpenCodeEvent(line: string): StreamToken | undefined {
  if (!line.trim()) return;
  let event: any;
  try { event = JSON.parse(line); } catch { throw new Error("OpenCode returned invalid JSON output."); }
  if (event.type === "error") {
    const message = typeof event.error?.message === "string" ? event.error.message.slice(0, 500) : "Request failed";
    const status = typeof event.error?.status === "number" ? ` (${event.error.status})` : "";
    throw new Error(`OpenCode${status}: ${message}`);
  }
  if (event.type === "text" && typeof event.part?.text === "string") return { type: "content", text: event.part.text };
  if (event.type === "tool_use") throw new Error("OpenCode attempted an internal tool call; Morningstar owns tool execution.");
}

export async function* openCodeCliStream(model: string, messages: Message[], signal?: AbortSignal): AsyncGenerator<StreamToken> {
  if (!isOpenCodeFreeModel(model)) throw new Error("OpenCode provider accepts only listed free OpenCode models.");
  if (messages.some(message => message.images?.length)) throw new Error("Images are not yet supported by the OpenCode bridge.");
  if (signal?.aborted) return;
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n")
    + "\nUse Morningstar's textual tool protocol when needed. Do not use OpenCode's internal tools.";
  const runtime = isolatedRuntime(system);
  const prompt = messages.filter(m => m.role !== "system").map(m => `${m.role}: ${m.content}`).join("\n\n");
  const child = spawn(executable(), ["run", "--standalone", "--format", "json", "--agent", "morningstar", "--model", model], {
    cwd: runtime.root, env: runtime.env, stdio: ["pipe", "pipe", "pipe"], signal, windowsHide: true,
  });
  let stderr = "", buffer = "", emitted = false;
  child.stderr.on("data", (data: Buffer) => { stderr = (stderr + data.toString()).slice(-2000); });
  // Resolve rather than reject before stdout is consumed, avoiding an unhandled rejection on ENOENT.
  const closed = new Promise<{ code: number; error?: Error }>(resolve => {
    child.on("error", error => resolve({ code: 1, error }));
    child.on("close", code => resolve({ code: code ?? 1 }));
  });
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);
  try {
    for await (const chunk of child.stdout) {
      buffer += chunk.toString();
      if (buffer.length > 8 * 1024 * 1024) throw new Error("OpenCode output exceeds limit.");
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) {
        const token = parseOpenCodeEvent(line);
        if (token) { emitted = true; yield token; }
      }
    }
    if (buffer.trim()) { const token = parseOpenCodeEvent(buffer); if (token) { emitted = true; yield token; } }
    const result = await closed;
    if (signal?.aborted) return;
    if (result.error) throw new Error(`OpenCode CLI unavailable: ${result.error.message.slice(0, 200)}`);
    if (result.code !== 0) throw new Error(`OpenCode exited ${result.code}: ${stderr.slice(-500)}`);
    if (!emitted) throw new Error("OpenCode returned no assistant response.");
  } finally {
    if (child.exitCode === null) child.kill();
    await closed;
    rmSync(runtime.root, { recursive: true, force: true, maxRetries: 3 });
  }
}
