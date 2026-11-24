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

export type HookProfile = "minimal" | "standard" | "strict";

export interface HookConfig {
  id?: string;
  matcher?: string;
  command: string;
  timeout?: number;
  failAction?: "continue" | "abort" | "warn";
  profiles?: HookProfile[];
  async?: boolean;
  description?: string;
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
 * Check if a hook is active based on current profile and disabled hooks.
 * Controlled via env vars: MORNINGSTAR_HOOK_PROFILE, MORNINGSTAR_DISABLED_HOOKS
 */
function isHookActiveForProfile(hook: HookConfig): boolean {
  // Check if hook is explicitly disabled via env var
  const disabledHooks = (process.env.MORNINGSTAR_DISABLED_HOOKS || "").split(",").filter(Boolean);
  if (hook.id && disabledHooks.includes(hook.id)) return false;

  // Check if hook matches current profile
  if (hook.profiles && hook.profiles.length > 0) {
    const currentProfile = (process.env.MORNINGSTAR_HOOK_PROFILE || "standard") as HookProfile;
    if (!hook.profiles.includes(currentProfile)) return false;
  }

  return true;
}

/**
 * Execute a hook asynchronously (fire-and-forget, non-blocking).
 */
export function executeHookAsync(hook: HookConfig, context: HookContext): void {
  executeHook(hook, context).catch(() => {});
}

/**
 * Execute all hooks for a given event.
 * Returns false if any hook aborts (allow: false).
 * Supports hook profiles and async execution.
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
    // Check profile/disabled status
    if (!isHookActiveForProfile(hook)) continue;

    // Check matcher (supports pipe syntax: "Bash|Write|Edit")
    if (hook.matcher) {
      const toMatch = context.tool || context.filePath || context.command || "";
      try {
        const regex = new RegExp(hook.matcher);
        if (!regex.test(toMatch)) continue;
      } catch {
        if (!toMatch.includes(hook.matcher)) continue;
      }
    }

    // Async hooks: fire-and-forget
    if (hook.async) {
      executeHookAsync(hook, { ...context, event });
      continue;
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
  const trusted = settings.trustedHooks ?? {};
  const lines = ["Aktive Command-Hooks (vertrauenswürdige Quellen):", ""];
  for (const [event, entries] of Object.entries(trusted)) {
    lines.push(`  ${event}:`);
    for (const entry of entries) {
      for (const hook of entry.hooks ?? [entry]) {
        lines.push(`    ${entry.matcher || "*"} → ${hook.command}`);
      }
    }
  }
  if (!Object.keys(trusted).length) lines.push("  Keine aktiven Hooks.");
  const configured = Object.values(settings.hooks ?? {}).reduce((sum, entries) => sum + entries.length, 0);
  if (configured && !Object.keys(trusted).length) lines.push("  Projekt-Hooks benötigen --trust-project oder explizite --settings.");
  lines.push("", "Events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Stop, SessionEnd.");
  lines.push("HTTP-, Prompt- und asynchrone Hooks werden zurückgewiesen.");
  return lines.join("\n");
}
