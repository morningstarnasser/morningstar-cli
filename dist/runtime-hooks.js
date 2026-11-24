import { exec } from "node:child_process";
import { bashExecutable } from "./runtime/platform-process.js";
const ALIASES = {
    sessionStart: "SessionStart", sessionEnd: "SessionEnd", preMessage: "UserPromptSubmit",
    preToolExecution: "PreToolUse", postToolExecution: "PostToolUse", postMessage: "Stop",
};
const EVENTS = new Set(["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop"]);
/** Reject unsupported execution semantics instead of pretending a policy ran. */
export function validateHooks(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("hooks must be an object");
    for (const [name, entries] of Object.entries(value)) {
        const event = ALIASES[name] ?? name;
        if (!EVENTS.has(event))
            throw new Error(`Unsupported hook event: ${name}`);
        if (!Array.isArray(entries))
            throw new Error(`hooks.${name} must be an array`);
        for (const entry of entries) {
            if (!entry || typeof entry !== "object")
                throw new Error(`Invalid hook: ${name}`);
            if (entry.matcher !== undefined) {
                if (typeof entry.matcher !== "string" || entry.matcher.length > 512)
                    throw new Error("Invalid hook matcher");
                new RegExp(entry.matcher);
            }
            const commands = entry.hooks ?? [entry];
            if (!Array.isArray(commands))
                throw new Error("hooks must contain an array of commands");
            for (const hook of commands) {
                if (!hook || (hook.type !== undefined && hook.type !== "command") || typeof hook.command !== "string" || !hook.command.trim())
                    throw new Error("Only command hooks are supported");
                if (hook.async)
                    throw new Error("Asynchronous hooks are not supported by the blocking runtime");
                if (hook.timeout !== undefined && (typeof hook.timeout !== "number" || !Number.isFinite(hook.timeout) || hook.timeout <= 0 || hook.timeout > 600))
                    throw new Error("Hook timeout must be 0–600 seconds");
            }
        }
    }
}
/** Called only with loader-assigned trustedHooks, after authorization for tool events. */
export async function runRuntimeHooks(hooks, event, context, signal) {
    const messages = [];
    const toolNames = { bash: "Bash", read: "Read", write: "Write", edit: "Edit", glob: "Glob", grep: "Grep", fetch: "WebFetch", web: "WebSearch" };
    const tool = toolNames[context.tool_name ?? ""] ?? context.tool_name ?? "";
    const input = context.tool_input;
    const toolInput = input ? { ...input,
        ...(input.filePath !== undefined ? { file_path: input.filePath } : {}),
        ...(input.oldStr !== undefined ? { old_string: input.oldStr } : {}),
        ...(input.newStr !== undefined ? { new_string: input.newStr } : {}),
        ...(input.replaceAll !== undefined ? { replace_all: input.replaceAll } : {}),
    } : undefined;
    const payload = { ...context, hook_event_name: event, tool_name: tool, tool_input: toolInput };
    for (const [name, entries] of Object.entries(hooks ?? {})) {
        if ((ALIASES[name] ?? name) !== event)
            continue;
        for (const entry of entries) {
            if (entry.matcher && !new RegExp(entry.matcher, "i").test(tool || context.reason || ""))
                continue;
            for (const hook of entry.hooks ?? [entry]) {
                if (signal?.aborted)
                    return { allowed: false, messages: ["Hook cancelled"] };
                const result = await new Promise((resolve) => {
                    const child = exec(hook.command, {
                        cwd: context.cwd, timeout: (hook.timeout ?? 10) * 1000, maxBuffer: 256 * 1024,
                        ...(process.platform === "win32" ? { shell: bashExecutable() } : {}),
                        signal, env: { ...process.env, MORNINGSTAR_HOOK_EVENT: event, CLAUDE_PROJECT_DIR: context.cwd },
                    }, (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr }));
                    child.stdin?.on("error", () => { });
                    child.stdin?.end(JSON.stringify(payload));
                });
                if (!result.ok)
                    return { allowed: false, messages: [...messages, result.stderr.trim() || `${event} hook failed`] };
                const output = result.stdout.trim();
                if (output.startsWith("{")) {
                    let parsed;
                    try {
                        parsed = JSON.parse(output);
                    }
                    catch {
                        return { allowed: false, messages: [...messages, "Invalid JSON from hook"] };
                    }
                    const specific = parsed.hookSpecificOutput;
                    if (parsed.continue === false || parsed.allow === false || parsed.decision === "block" || ["deny", "ask"].includes(specific?.permissionDecision)) {
                        return { allowed: false, messages: [...messages, String(parsed.stopReason ?? parsed.reason ?? specific?.permissionDecisionReason ?? "Blocked by hook")] };
                    }
                    // Hook output cannot mutate tool inputs or grant authorization.
                    if (specific?.updatedInput !== undefined)
                        return { allowed: false, messages: [...messages, "Hook updatedInput is unsupported; original action was not executed"] };
                    if (typeof specific?.additionalContext === "string")
                        messages.push(specific.additionalContext);
                    if (typeof parsed.systemMessage === "string")
                        messages.push(parsed.systemMessage);
                }
                else if (output)
                    messages.push(output);
            }
        }
    }
    return { allowed: true, messages };
}
//# sourceMappingURL=runtime-hooks.js.map