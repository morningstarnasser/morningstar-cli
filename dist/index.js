#!/usr/bin/env node
// ─── Global Error Safety Net ─────────────────────────────
// Prevent unhandled fetch termination errors from crashing the process.
// These occur when the user aborts (Ctrl+C) an active API stream.
process.on("unhandledRejection", (reason) => {
    if (reason instanceof TypeError) {
        const msg = reason.message || "";
        if (msg === "terminated" || msg.includes("aborted") || msg.includes("other side closed")) {
            return; // Silently ignore abort-related fetch errors
        }
    }
    console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
    const msg = err.message || "";
    if (msg === "terminated" || msg.includes("aborted") || msg.includes("other side closed") || msg.includes("SocketError")) {
        return; // Silently ignore abort-related errors
    }
    console.error("Uncaught exception:", err);
    process.exit(1);
});
import React from "react";
import { render } from "ink";
import { program } from "commander";
import { App } from "./app.js";
import { detectProject, buildSystemPrompt } from "./context.js";
import { loadSettings } from "./settings.js";
import { getLastConversation, loadConversation } from "./history.js";
import { runPrintMode } from "./print-mode.js";
import { buildCLIConfig, createApiKeyHelpers, ensureApiKey, getSystemPromptOverride, loadEnvFile, loadSavedConfig, saveConfig, } from "./cli-bootstrap.js";
// ─── Config ──────────────────────────────────────────────
const VERSION = "1.0.0";
const sessionStart = Date.now();
const saved = loadSavedConfig();
const { getStoredApiKey, storeApiKey } = createApiKeyHelpers(saved);
// ─── CLI Setup ───────────────────────────────────────────
program
    .name("morningstar")
    .description("Morningstar AI - Multi-Provider Terminal Coding Assistant")
    .version(VERSION)
    .option("-k, --api-key <key>", "API Key fuer den Provider")
    .option("-m, --model <model>", "Model ID (default: deepseek-reasoner)")
    .option("-d, --dir <path>", "Working directory")
    .option("--chat", "Chat-only mode (no tools)")
    .option("--skip-permissions", "Bypass all permission prompts")
    // Claude Code-compatible flags:
    .option("-p, --print [prompt]", "Print mode: query, respond, exit")
    .option("-c, --continue", "Resume most recent session")
    .option("-r, --resume <id>", "Resume session by ID")
    .option("--output-format <fmt>", "Output: text, json, stream-json", "text")
    .option("--verbose", "Expanded logging")
    .option("--quiet", "Suppress non-essential output")
    .option("--allowedTools <tools>", "Pre-approve tools (comma-separated)")
    .option("--max-turns <n>", "Max agentic turns", parseInt)
    .option("--system-prompt <text>", "Override system prompt")
    .option("--system-prompt-file <path>", "System prompt from file")
    .option("--add-dir <path>", "Additional working directory")
    .option("--fallback-model <model>", "Auto-fallback model")
    .option("--fast", "Fast mode (use lighter model)")
    // Permission flags:
    .option("--dangerously-skip-permissions", "Bypass ALL permission prompts (dangerous!)")
    .option("--permission-mode <mode>", "Permission mode: auto|ask|strict|bypassPermissions|acceptEdits|plan|dontAsk|delegate")
    // Enhanced CLI flags:
    .option("--append-system-prompt <text>", "Append text to system prompt")
    .option("--agents <agents>", "Pre-select agents (comma-separated)")
    .option("--json-schema <schema>", "Structured output JSON schema")
    .option("--debug", "Debug mode (show raw messages, token counts, timing)")
    .option("--disallowed-tools <tools>", "Block specific tools (comma-separated)")
    .option("--tools <tools>", "Whitelist tools (comma-separated)")
    .option("--max-budget-usd <amount>", "Max session budget in USD", parseFloat)
    .option("--fork-session <id>", "Fork from existing session")
    .option("--session-id <id>", "Explicit session ID")
    .option("--sandbox", "Run in sandboxed mode (filesystem restrictions)")
    .parse();
const opts = program.opts();
// ─── Settings ─────────────────────────────────────────────
const cwd = opts.dir || process.cwd();
const projectSettings = loadSettings(cwd);
if (projectSettings.env) {
    for (const [key, val] of Object.entries(projectSettings.env)) {
        if (!process.env[key])
            process.env[key] = val;
    }
}
loadEnvFile(cwd);
const { config, chatOnly, skipPermissions } = buildCLIConfig(opts, saved, projectSettings, getStoredApiKey);
// ─── System Prompt Override ─────────────────────────────
const systemPromptOverride = getSystemPromptOverride(opts);
// ─── Session Resume ─────────────────────────────────────
let resumedMessages;
if (opts.continue) {
    const last = getLastConversation();
    if (last) {
        resumedMessages = last.messages;
        if (!opts.quiet)
            console.log(`  Resuming session: ${last.name} (${last.messageCount} messages)`);
    }
    else {
        if (!opts.quiet)
            console.log("  No previous session found.");
    }
}
else if (opts.resume) {
    const conv = loadConversation(opts.resume);
    if (conv) {
        resumedMessages = conv.messages;
        if (!opts.quiet)
            console.log(`  Resuming session: ${conv.name} (${conv.messageCount} messages)`);
    }
    else {
        console.error(`  Session "${opts.resume}" not found.`);
        process.exit(1);
    }
}
// ─── Interactive API Key Setup ───────────────────────────
await ensureApiKey(config, opts, getStoredApiKey, storeApiKey);
// ─── Project Detection ───────────────────────────────────
const ctx = detectProject(cwd);
let baseSystemPrompt = chatOnly
    ? "Du bist Morningstar AI, ein hilfreicher Coding-Assistant. Antworte direkt und effizient."
    : buildSystemPrompt(ctx);
// Apply system prompt override
if (systemPromptOverride) {
    baseSystemPrompt = systemPromptOverride;
}
// Append system prompt if flag set
if (config.appendSystemPrompt) {
    baseSystemPrompt += "\n\n" + config.appendSystemPrompt;
}
// Fork session: load messages from existing session
if (config.forkSession) {
    const forked = loadConversation(config.forkSession);
    if (forked) {
        resumedMessages = [...forked.messages];
        if (!opts.quiet)
            console.log(`  Forked from session: ${forked.name} (${forked.messageCount} messages)`);
    }
    else {
        console.error(`  Session "${config.forkSession}" not found for forking.`);
    }
}
// ─── Print Mode (non-interactive) ───────────────────────
if (opts.print !== undefined) {
    const prompt = typeof opts.print === "string" ? opts.print : "";
    // If no prompt given and stdin is a TTY, show usage
    if (!prompt && process.stdin.isTTY) {
        console.error("Usage: morningstar -p \"your prompt\" or echo \"input\" | morningstar -p \"prompt\"");
        process.exit(1);
    }
    await runPrintMode(prompt || "", baseSystemPrompt, config, cwd);
    // runPrintMode calls process.exit internally
}
// ─── Render Ink App ──────────────────────────────────────
render(React.createElement(App, {
    config,
    ctx,
    chatOnly,
    skipPermissions,
    baseSystemPrompt,
    sessionStart,
    getStoredApiKey,
    storeApiKey,
    saveConfig,
    resumedMessages,
}));
//# sourceMappingURL=index.js.map