// ─── Built-in Hooks ────────────────────────────────────────
// Fast, in-process hooks that run as TypeScript functions.
// No external process spawning - pure logic for performance.
// Opt-in via settings.builtinHooks configuration.
import { basename } from "node:path";
// ─── Config Protection Patterns ─────────────────────────────
const CONFIG_BASENAME_EXACT = [
    "tsconfig.json",
    "biome.json",
    "biome.jsonc",
    ".editorconfig",
    "deno.json",
    "deno.jsonc",
];
const CONFIG_BASENAME_PREFIXES = [
    ".eslintrc",
    ".prettierrc",
    "eslint.config.",
    "prettier.config.",
    "tsconfig.",
];
// ─── Session Counters (reset per process) ───────────────────
let toolCallCount = 0;
let interactionCount = 0;
// ─── Helpers ────────────────────────────────────────────────
function isFileEditTool(tool) {
    const normalized = tool.toLowerCase();
    return normalized === "write" || normalized === "edit";
}
function isProtectedConfigFile(filePath) {
    const name = basename(filePath);
    for (const exact of CONFIG_BASENAME_EXACT) {
        if (name === exact)
            return true;
    }
    for (const prefix of CONFIG_BASENAME_PREFIXES) {
        if (name.startsWith(prefix))
            return true;
    }
    return false;
}
const CODE_EXTENSIONS = [
    ".ts", ".tsx", ".js", ".jsx",
];
function isCodeFile(filePath) {
    const lower = filePath.toLowerCase();
    return CODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
function contentContainsConsoleLog(content) {
    // Match console.log( with word boundary awareness.
    // Simple string check is faster than regex for hot paths.
    return content.includes("console.log");
}
// ─── Pre-execution Hooks ────────────────────────────────────
/**
 * Run all enabled built-in pre-execution hooks.
 * These run synchronously before a tool executes.
 * Returns an array of results; check `allowed` to gate execution.
 */
export function runBuiltinPreHooks(event, config) {
    const results = [];
    if (config.configProtection && isFileEditTool(event.tool) && event.filePath) {
        const result = checkConfigProtection(event.filePath);
        if (result !== null) {
            results.push(result);
        }
    }
    if (config.consoleLogWarning && isFileEditTool(event.tool) && event.content) {
        const result = checkConsoleLog(event.content);
        if (result !== null) {
            results.push(result);
        }
    }
    return results;
}
function checkConfigProtection(filePath) {
    if (!isProtectedConfigFile(filePath))
        return null;
    const name = basename(filePath);
    return {
        hookId: "configProtection",
        allowed: false,
        message: `Blocked: "${name}" is a protected configuration file. Modifying linter/formatter configs can break project standards. Override with configProtection: false if intentional.`,
        severity: "error",
    };
}
function checkConsoleLog(content) {
    if (!contentContainsConsoleLog(content))
        return null;
    return {
        hookId: "consoleLogWarning",
        allowed: true,
        message: "Warning: content contains console.log statements. Consider removing them before committing, or replace with a proper logger.",
        severity: "warning",
    };
}
// ─── Post-execution Hooks ───────────────────────────────────
/**
 * Run all enabled built-in post-execution hooks.
 * These run synchronously after a tool executes.
 * Useful for reminders and tracking - they never block.
 */
export function runBuiltinPostHooks(event, config) {
    const results = [];
    // Always increment counters (even if hooks are disabled) to keep
    // accurate counts in case hooks are enabled mid-session.
    toolCallCount++;
    interactionCount++;
    if (config.qualityGate && isFileEditTool(event.tool) && event.filePath) {
        const result = checkQualityGate(event.filePath);
        if (result !== null) {
            results.push(result);
        }
    }
    if (config.suggestCompact) {
        const result = checkCompactSuggestion();
        if (result !== null) {
            results.push(result);
        }
    }
    if (config.costTracker) {
        const result = checkCostWarning();
        if (result !== null) {
            results.push(result);
        }
    }
    return results;
}
function checkQualityGate(filePath) {
    if (!isCodeFile(filePath))
        return null;
    const name = basename(filePath);
    const isTsx = name.endsWith(".ts") || name.endsWith(".tsx");
    const checks = isTsx
        ? "TypeScript (tsc --noEmit) and ESLint"
        : "ESLint";
    return {
        hookId: "qualityGate",
        allowed: true,
        message: `Reminder: "${name}" was modified. Consider running ${checks} to verify no errors were introduced.`,
        severity: "info",
    };
}
function checkCompactSuggestion() {
    if (toolCallCount % 50 !== 0)
        return null;
    return {
        hookId: "suggestCompact",
        allowed: true,
        message: `${toolCallCount} tool calls this session. Consider running /compact to free up context window.`,
        severity: "info",
    };
}
function checkCostWarning() {
    if (interactionCount % 100 !== 0)
        return null;
    return {
        hookId: "costTracker",
        allowed: true,
        message: `${interactionCount} interactions this session. Check /cost to review accumulated token usage and spending.`,
        severity: "warning",
    };
}
// ─── Defaults ───────────────────────────────────────────────
/**
 * Returns sensible defaults for built-in hook configuration.
 * Safe guards enabled, performance-impacting features disabled.
 */
export function getBuiltinHookDefaults() {
    return {
        qualityGate: false,
        configProtection: true,
        consoleLogWarning: true,
        suggestCompact: false,
        costTracker: false,
    };
}
// ─── Display ────────────────────────────────────────────────
const HOOK_LABELS = [
    {
        key: "configProtection",
        label: "Config Protection",
        description: "Blocks modifications to linter/formatter config files",
    },
    {
        key: "consoleLogWarning",
        label: "Console.log Warning",
        description: "Warns when console.log statements are added",
    },
    {
        key: "qualityGate",
        label: "Quality Gate",
        description: "Reminds to run type-check/lint after code edits",
    },
    {
        key: "suggestCompact",
        label: "Suggest Compact",
        description: "Suggests /compact every 50 tool calls",
    },
    {
        key: "costTracker",
        label: "Cost Tracker",
        description: "Warns about accumulated cost every 100 interactions",
    },
];
/**
 * Format built-in hooks status for the /hooks command display.
 */
export function formatBuiltinHooksStatus(config) {
    const lines = [
        "Built-in Hooks:\n",
    ];
    for (const { key, label, description } of HOOK_LABELS) {
        const enabled = config[key] === true;
        const icon = enabled ? "\u2714" : "\u2718";
        lines.push(`  ${icon} ${label}`);
        lines.push(`    ${description}`);
        lines.push("");
    }
    lines.push(`  Session stats: ${toolCallCount} tool calls, ${interactionCount} interactions`);
    lines.push("");
    lines.push("  Configure in settings.json \u2192 builtinHooks");
    lines.push("  Example: { \"builtinHooks\": { \"qualityGate\": true, \"configProtection\": true } }");
    return lines.join("\n");
}
// ─── Testing Utilities ──────────────────────────────────────
/**
 * Reset session counters. Intended for testing only.
 */
export function resetBuiltinHookCounters() {
    toolCallCount = 0;
    interactionCount = 0;
}
/**
 * Get current session counter values. Intended for testing/debugging.
 */
export function getBuiltinHookCounters() {
    return { toolCalls: toolCallCount, interactions: interactionCount };
}
//# sourceMappingURL=builtin-hooks.js.map