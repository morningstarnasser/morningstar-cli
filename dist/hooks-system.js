// ─── Enhanced Hooks System ───────────────────────────────
// Event-driven hooks for tool execution, file operations, and session lifecycle
import { exec } from "node:child_process";
const ALL_EVENTS = [
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
export function getHooksForEvent(event, settings) {
    if (!settings.hooks || !settings.hooks[event])
        return [];
    return settings.hooks[event];
}
/**
 * Execute a hook command asynchronously.
 * Passes context as JSON on stdin.
 * Expects JSON output for decision control.
 */
export async function executeHook(hook, context) {
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
                    }
                    else {
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
                }
                catch {
                    // Non-JSON output: treat as success
                    resolve({ allow: true, output: stdout });
                }
            });
            // Write context to stdin
            if (proc.stdin) {
                proc.stdin.write(JSON.stringify(context));
                proc.stdin.end();
            }
        }
        catch (e) {
            resolve({ allow: true, message: `Hook error: ${e.message}` });
        }
    });
}
/**
 * Check if a hook is active based on current profile and disabled hooks.
 * Controlled via env vars: MORNINGSTAR_HOOK_PROFILE, MORNINGSTAR_DISABLED_HOOKS
 */
function isHookActiveForProfile(hook) {
    // Check if hook is explicitly disabled via env var
    const disabledHooks = (process.env.MORNINGSTAR_DISABLED_HOOKS || "").split(",").filter(Boolean);
    if (hook.id && disabledHooks.includes(hook.id))
        return false;
    // Check if hook matches current profile
    if (hook.profiles && hook.profiles.length > 0) {
        const currentProfile = (process.env.MORNINGSTAR_HOOK_PROFILE || "standard");
        if (!hook.profiles.includes(currentProfile))
            return false;
    }
    return true;
}
/**
 * Execute a hook asynchronously (fire-and-forget, non-blocking).
 */
export function executeHookAsync(hook, context) {
    executeHook(hook, context).catch(() => { });
}
/**
 * Execute all hooks for a given event.
 * Returns false if any hook aborts (allow: false).
 * Supports hook profiles and async execution.
 */
export async function executeHooks(event, context, settings) {
    const hooks = getHooksForEvent(event, settings);
    if (hooks.length === 0)
        return { allowed: true, messages: [] };
    const messages = [];
    for (const hook of hooks) {
        // Check profile/disabled status
        if (!isHookActiveForProfile(hook))
            continue;
        // Check matcher (supports pipe syntax: "Bash|Write|Edit")
        if (hook.matcher) {
            const toMatch = context.tool || context.filePath || context.command || "";
            try {
                const regex = new RegExp(hook.matcher);
                if (!regex.test(toMatch))
                    continue;
            }
            catch {
                if (!toMatch.includes(hook.matcher))
                    continue;
            }
        }
        // Async hooks: fire-and-forget
        if (hook.async) {
            executeHookAsync(hook, { ...context, event });
            continue;
        }
        const result = await executeHook(hook, { ...context, event });
        if (result.message)
            messages.push(result.message);
        if (!result.allow) {
            return { allowed: false, messages };
        }
    }
    return { allowed: true, messages };
}
/**
 * List all available hook events.
 */
export function listHookEvents() {
    return [...ALL_EVENTS];
}
/**
 * Format hooks display for /hooks command.
 */
export function formatHooksDisplay(settings) {
    const lines = ["Hooks-Konfiguration:\n"];
    if (!settings.hooks || Object.keys(settings.hooks).length === 0) {
        lines.push("  Keine Hooks konfiguriert.\n");
    }
    else {
        const currentProfile = process.env.MORNINGSTAR_HOOK_PROFILE || "standard";
        lines.push(`  Aktives Profil: ${currentProfile}\n`);
        for (const [event, hooks] of Object.entries(settings.hooks)) {
            const hookList = hooks;
            lines.push(`  ${event}:`);
            for (const h of hookList) {
                const active = isHookActiveForProfile(h);
                const status = active ? "\u2714" : "\u2718";
                const idStr = h.id ? ` (${h.id})` : "";
                lines.push(`    ${status}${idStr} command: ${h.command}`);
                if (h.description)
                    lines.push(`      ${h.description}`);
                if (h.matcher)
                    lines.push(`      matcher: ${h.matcher}`);
                if (h.profiles)
                    lines.push(`      profiles: ${h.profiles.join(", ")}`);
                if (h.timeout)
                    lines.push(`      timeout: ${h.timeout}ms`);
                if (h.failAction)
                    lines.push(`      failAction: ${h.failAction}`);
                if (h.async)
                    lines.push(`      async: true`);
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
//# sourceMappingURL=hooks-system.js.map