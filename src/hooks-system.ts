// ─── Enhanced Hooks System ───────────────────────────────
// Event-driven hooks for tool execution, file operations, and session lifecycle

import { exec } from "node:child_process";
import type { MorningstarSettings } from "./settings.js";

export type HookEvent =
  | "preToolExecution" | "postToolExecution"
  | "preFileWrite" | "postFileWrite"
  | "preFileEdit" | "postFileEdit"
  | "preBash" | "postBash"
  | "preCommit" | "postCommit"
  | "sessionStart" | "sessionEnd"
  | "preMessage" | "postMessage";

export interface HookConfig {
  matcher?: string;
  command: string;
  timeout?: number;
  failAction?: "continue" | "abort" | "warn";
}

export interface HookResult {
  allow: boolean;
  message?: string;
  output?: string;
}

export interface HookContext {
  event: HookEvent;
  tool?: string;
  args?: string;
  filePath?: string;
  command?: string;
  content?: string;
  cwd?: string;
}

const ALL_EVENTS: HookEvent[] = [
  "preToolExecution", "postToolExecution",
  "preFileWrite", "postFileWrite",
  "preFileEdit", "postFileEdit",
  "preBash", "postBash",
  "preCommit", "postCommit",
  "sessionStart", "sessionEnd",
  "preMessage", "postMessage",
];

/**
 * Get all registered hooks for a given event from settings.
 */
export function getHooksForEvent(event: HookEvent, settings: MorningstarSettings): HookConfig[] {
  if (!settings.hooks || !settings.hooks[event]) return [];
  return settings.hooks[event] as HookConfig[];
}

/**
 * Execute a hook command asynchronously.
 * Passes context as JSON on stdin.
 * Expects JSON output for decision control.
 */
export async function executeHook(hook: HookConfig, context: HookContext): Promise<HookResult> {
  const timeout = hook.timeout || 10000;

  return new Promise((resolve) => {
    try {
      const proc = exec(hook.command, {
        timeout,
        maxBuffer: 1024 * 256,
        env: {
          ...process.env,
          MORNINGSTAR_HOOK_EVENT: context.event,
          MORNINGSTAR_HOOK_TOOL: context.tool || "",
          MORNINGSTAR_HOOK_FILE: context.filePath || "",
          MORNINGSTAR_HOOK_CWD: context.cwd || process.cwd(),
        },
      }, (error, stdout, stderr) => {
        if (error) {
          const failAction = hook.failAction || "continue";
          if (failAction === "abort") {
            resolve({ allow: false, message: `Hook failed: ${error.message}`, output: stderr });
          } else {
            resolve({ allow: true, message: stderr || error.message, output: stdout });
          }
          return;
        }

        // Try to parse JSON output for decision control
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve({
            allow: parsed.allow !== false,
            message: parsed.message || undefined,
            output: stdout,
          });
        } catch {
          // Non-JSON output: treat as success
          resolve({ allow: true, output: stdout });
        }
      });

      // Write context to stdin
      if (proc.stdin) {
        proc.stdin.write(JSON.stringify(context));
        proc.stdin.end();
      }
    } catch (e) {
      resolve({ allow: true, message: `Hook error: ${(e as Error).message}` });
    }
  });
}

/**
 * Execute all hooks for a given event.
 * Returns false if any hook aborts (allow: false).
 */
export async function executeHooks(
  event: HookEvent,
  context: Omit<HookContext, "event">,
  settings: MorningstarSettings
): Promise<{ allowed: boolean; messages: string[] }> {
  const hooks = getHooksForEvent(event, settings);
  if (hooks.length === 0) return { allowed: true, messages: [] };

  const messages: string[] = [];

  for (const hook of hooks) {
    // Check matcher
    if (hook.matcher) {
      const toMatch = context.tool || context.filePath || context.command || "";
      try {
        const regex = new RegExp(hook.matcher);
        if (!regex.test(toMatch)) continue;
      } catch {
        if (!toMatch.includes(hook.matcher)) continue;
      }
    }

    const result = await executeHook(hook, { ...context, event });

    if (result.message) messages.push(result.message);
    if (!result.allow) {
      return { allowed: false, messages };
    }
  }

  return { allowed: true, messages };
}

/**
 * List all available hook events.
 */
export function listHookEvents(): string[] {
  return [...ALL_EVENTS];
}

/**
 * Format hooks display for /hooks command.
 */
export function formatHooksDisplay(settings: MorningstarSettings): string {
  const lines: string[] = ["Hooks-Konfiguration:\n"];

  if (!settings.hooks || Object.keys(settings.hooks).length === 0) {
    lines.push("  Keine Hooks konfiguriert.\n");
  } else {
    for (const [event, hooks] of Object.entries(settings.hooks)) {
      const hookList = hooks as HookConfig[];
      lines.push(`  ${event}:`);
      for (const h of hookList) {
        lines.push(`    command: ${h.command}`);
        if (h.matcher) lines.push(`    matcher: ${h.matcher}`);
        if (h.timeout) lines.push(`    timeout: ${h.timeout}ms`);
        if (h.failAction) lines.push(`    failAction: ${h.failAction}`);
        lines.push("");
      }
    }
  }

  lines.push("  Verfuegbare Hook-Events:");
  for (const event of ALL_EVENTS) {
    lines.push(`    ${event}`);
  }

  lines.push("\n  Konfiguriere in .morningstar/settings.json → hooks");
  lines.push('  Beispiel: { "hooks": { "preBash": [{ "command": "echo hook!", "matcher": "rm" }] } }');

  return lines.join("\n");
}
