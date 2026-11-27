#!/usr/bin/env node
// ─── Global Error Safety Net ─────────────────────────────
// Aborting an in-flight stream (Esc / Ctrl+C) is a normal user action, but it
// surfaces as a rejection from whatever was mid-flight: fetch, a spawned child
// process, or the AbortController itself. Those are expected and stay silent;
// everything else is still reported.
/** True for the rejection noise a deliberate abort leaves behind. */
function isAbortNoise(reason) {
    if (!reason || typeof reason !== "object")
        return false;
    const error = reason;
    // DOMException [AbortError] — thrown by AbortController.abort() itself and
    // by anything wired to its signal. It is not a TypeError.
    if (error.name === "AbortError")
        return true;
    const message = error.message ?? "";
    return message === "terminated"
        || message.includes("aborted")
        || message.includes("other side closed")
        || message.includes("SocketError");
}
process.on("unhandledRejection", (reason) => {
    if (isAbortNoise(reason))
        return;
    console.error("Unhandled rejection:", reason);
    process.exitCode = 1;
});
process.on("uncaughtException", (err) => {
    if (isAbortNoise(err))
        return;
    console.error("Uncaught exception:", err);
    process.exit(1);
});
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { program } from "commander";
// ─── Subcommand Routing (telegram gateway / cron) ────────
// Handled before commander/Ink so the interactive path stays untouched.
const subcommand = process.argv[2];
if (subcommand === "update") {
    const { runUpdateCli } = await import("./update-cli.js");
    process.exit(await runUpdateCli(process.argv.slice(3)));
}
if (subcommand === "status-mcp") {
    const { serveStatusMCP } = await import("./runtime/status-mcp.js");
    await serveStatusMCP(process.argv[3]);
    process.exit(0);
}
if (subcommand === "skills" || subcommand === "superbrain") {
    const command = process.argv.slice(3).join(" ") || "status";
    const output = subcommand === "skills"
        ? (await import("./skills-runtime.js")).runSkillCommand(command, process.cwd())
        : await (await import("./vault.js")).runVaultCommandAsync(command);
    console.log(output);
    process.exit(/^(Skill|Vault)-Fehler:/.test(output) ? 1 : 0);
}
if (subcommand === "settings") {
    const { runSettingsCli } = await import("./settings-cli.js");
    process.exit(runSettingsCli(process.argv.slice(3), process.cwd()));
}
if (subcommand === "telegram" || subcommand === "gateway") {
    // Gateway identity, authorization, and working-root configuration are global
    // trust decisions. Never let a repository's .env files influence this runtime.
    const { startGateway } = await import("./telegram/gateway.js");
    await startGateway(); // long-running; exits via SIGINT/SIGTERM
    process.exit(0);
}
if (subcommand === "cron") {
    const { loadProjectEnvFiles } = await import("./env.js");
    loadProjectEnvFiles(process.cwd());
    const { runCronCli } = await import("./cron-cli.js");
    await runCronCli(process.argv.slice(3));
    process.exit(0);
}
// ─── Config ──────────────────────────────────────────────
const VERSION = "1.5.5";
const sessionStart = Date.now();
// ─── CLI Setup ───────────────────────────────────────────
program
    .name("morningstar")
    .description("Morningstar AI - Multi-Provider Terminal Coding Assistant")
    .version(VERSION)
    .addHelpText("after", "\nUpdates: morningstar update [--check] [--json]")
    .argument("[prompt...]", "Initial prompt")
    .option("-w, --worktree [name]", "Create an isolated Git worktree from HEAD")
    .option("-k, --api-key <key>", "API Key (sichtbar in der Prozessliste; Umgebungsvariable bevorzugen)")
    .option("-m, --model <model>", "Model ID (default: deepseek-reasoner)")
    .option("-d, --dir <path>", "Working directory")
    .option("--chat", "Chat-only mode (no tools)")
    .option("--channels <channels>", "Connect a channel to this interactive session (telegram)")
    .option("--skip-permissions", "Bypass all permission prompts")
    .option("--yolo", "Automatically approve tools for this run, including swarm workers (alias for --dangerously-skip-permissions)")
    // Claude Code-compatible flags:
    .option("-p, --print [prompt]", "Print mode: query, respond, exit")
    .option("-c, --continue", "Resume most recent session")
    .option("-r, --resume <id>", "Resume session by ID")
    .option("--output-format <fmt>", "Output: text, json, stream-json", "text")
    .option("--verbose", "Expanded logging")
    .option("--quiet", "Suppress non-essential output")
    .option("--allowedTools <tools>", "Pre-approve tools (comma-separated)")
    .option("--max-turns <n>", "Optional turn limit (default unlimited; 0 = unlimited)", Number)
    .option("--no-auto-knowledge", "Disable automatic local skills/Superbrain recall")
    .option("--no-self-improvement", "Disable learning and recall of project corrections and verified checks")
    .option("--context-chars <n>", "Provider request character budget (default 60000)", Number)
    .option("--system-prompt <text>", "Override system prompt")
    .option("--system-prompt-file <path>", "System prompt from file")
    .option("--append-system-prompt-file <path>", "Append a system prompt file")
    .option("--trust-project", "Trust project settings including hooks, model routing and permission grants")
    .option("--settings <json-or-path>", "Additional explicit settings JSON or file")
    .option("--setting-sources <sources>", "Settings sources: user,project,local; managed policy always applies")
    .option("--input-format <format>", "Input: text or stream-json", "text")
    .option("--no-session-persistence", "Do not persist this conversation")
    .option("-n, --name <name>", "Session display name")
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
    .option("--max-budget-usd <amount>", "Max session budget in USD", Number)
    .option("--fork-session <id>", "Fork from existing session")
    .option("--session-id <id>", "Explicit session ID")
    .option("--sandbox", "Run in sandboxed mode (filesystem restrictions)")
    .parse();
const opts = program.opts();
if (opts.channels && opts.channels !== "telegram")
    program.error("Supported channel: --channels telegram");
if (opts.channels && (opts.print !== undefined || !process.stdin.isTTY))
    program.error("Telegram channels require an interactive terminal session.");
// Diagnostics/help finish before loading provider, runner or terminal modules.
const [bootstrap, { loadSettings }, { applyProjectEnv, loadProjectEnvFiles }, { createWorktreeSession }, { enableSandbox }, { getLastConversation, loadConversation }, { detectProject, buildSystemPrompt }, { loadProjectMemory }, { runRuntimeHooks }] = await Promise.all([
    import("./cli-bootstrap.js"), import("./settings.js"), import("./env.js"),
    import("./worktree-session.js"), import("./sandbox.js"), import("./history.js"),
    import("./context.js"), import("./project-memory.js"), import("./runtime-hooks.js"),
]);
const { buildCLIConfig, createApiKeyHelpers, ensureApiKey, getSystemPromptOverride, loadSavedConfig, saveConfig } = bootstrap;
const saved = loadSavedConfig();
const { getStoredApiKey, storeApiKey } = createApiKeyHelpers(saved);
// ─── Settings ─────────────────────────────────────────────
let cwd = resolve(opts.dir || process.cwd());
if (opts.worktree) {
    const worktree = createWorktreeSession(cwd, typeof opts.worktree === "string" ? opts.worktree : "session");
    cwd = worktree.path;
    opts.dir = cwd;
    console.error(`Worktree: ${cwd} (branch ${worktree.branch}; preserved on exit)`);
}
const projectSettings = loadSettings(cwd, {
    sources: opts.settingSources === undefined ? undefined : String(opts.settingSources).split(",").map((s) => s.trim()).filter(Boolean),
    settings: opts.settings,
    trustProject: opts.trustProject === true,
});
if (!["text", "stream-json"].includes(opts.inputFormat))
    throw new Error("Invalid --input-format");
if (!["text", "json", "stream-json"].includes(opts.outputFormat))
    throw new Error("Invalid --output-format");
opts.noSessionPersistence = opts.sessionPersistence === false;
if (opts.print === undefined && (opts.noSessionPersistence || opts.inputFormat !== "text"))
    throw new Error("--no-session-persistence and --input-format require print mode");
if (projectSettings.env) {
    applyProjectEnv(projectSettings.env);
}
loadProjectEnvFiles(cwd);
const { config, chatOnly, skipPermissions } = buildCLIConfig(opts, saved, projectSettings, getStoredApiKey);
// ─── System Prompt Override ─────────────────────────────
const systemPromptOverride = getSystemPromptOverride(opts);
if (config.sandbox)
    enableSandbox({ allowedPaths: [cwd], networkAccess: false });
// ─── Session Resume ─────────────────────────────────────
let resumedMessages;
if (opts.continue) {
    const last = getLastConversation(cwd);
    if (last) {
        resumedMessages = last.messages;
        config.sessionId ??= last.id;
        config.sessionName ??= last.name;
        if (!opts.quiet)
            console.error(`  Resuming session: ${last.name} (${last.messageCount} messages)`);
    }
    else {
        if (!opts.quiet)
            console.error("  No previous session found.");
    }
}
else if (opts.resume) {
    const conv = loadConversation(opts.resume);
    if (conv) {
        resumedMessages = conv.messages;
        config.sessionId ??= conv.id;
        config.sessionName ??= conv.name;
        if (!opts.quiet)
            console.error(`  Resuming session: ${conv.name} (${conv.messageCount} messages)`);
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
if (projectSettings.customInstructions)
    baseSystemPrompt += `\n\n${projectSettings.customInstructions}`;
if (projectSettings.language)
    baseSystemPrompt += `\n\nRespond in: ${projectSettings.language}`;
if (projectSettings.outputStyle)
    baseSystemPrompt += `\n\nOutput style requested by user: ${projectSettings.outputStyle}`;
// Fork session: load messages from existing session
if (config.forkSession) {
    if (opts.continue || opts.resume)
        throw new Error("--fork-session cannot be combined with --continue or --resume");
    const forked = loadConversation(config.forkSession);
    if (forked) {
        resumedMessages = [...forked.messages];
        if (!opts.quiet)
            console.error(`  Forked from session: ${forked.name} (${forked.messageCount} messages)`);
    }
    else {
        console.error(`  Session "${config.forkSession}" not found for forking.`);
        process.exit(1);
    }
}
// Global/explicit MCP configuration is already filtered by the settings loader.
const { connectConfiguredMCPServers, disconnectAllMCPServers } = await import("./mcp.js");
if (!chatOnly && !config.sandbox) {
    const failures = await connectConfiguredMCPServers(projectSettings);
    for (const failure of failures)
        console.error(failure);
    if (failures.length)
        baseSystemPrompt += `\n\nNicht verfügbare MCP-Verbindungen:\n${failures.join("\n")}`;
}
// ─── Print Mode (non-interactive) ───────────────────────
if (opts.print !== undefined) {
    const { runPrintMode } = await import("./print-mode.js");
    const prompt = [typeof opts.print === "string" ? opts.print : "", program.args.join(" ")].filter(Boolean).join(" ");
    // If no prompt given and stdin is a TTY, show usage
    if (!prompt && process.stdin.isTTY) {
        console.error("Usage: morningstar -p \"your prompt\" or echo \"input\" | morningstar -p \"prompt\"");
        process.exit(1);
    }
    const projectMemory = loadProjectMemory(cwd);
    try {
        await runPrintMode(prompt || "", [baseSystemPrompt, projectMemory].filter(Boolean).join("\n\n"), config, cwd, resumedMessages);
    }
    finally {
        await disconnectAllMCPServers();
    }
    process.exit(process.exitCode ?? 0);
}
// ─── Render Ink App ──────────────────────────────────────
config.sessionId ??= randomUUID();
const sessionHook = await runRuntimeHooks(config.runtimeSettings?.trustedHooks, "SessionStart", { cwd, session_id: config.sessionId, reason: resumedMessages?.length ? "resume" : "startup" });
if (!sessionHook.allowed)
    throw new Error(sessionHook.messages.join("\n"));
if (sessionHook.messages.length)
    baseSystemPrompt += `\n\nSession hook context:\n${sessionHook.messages.join("\n")}`;
const [{ default: React }, { render }, { App }] = await Promise.all([
    import("react"), import("ink"), import("./app.js"),
]);
const interactiveApp = render(React.createElement(App, {
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
    initialPrompt: program.args.join(" "),
}), { exitOnCtrlC: false });
await interactiveApp.waitUntilExit();
await disconnectAllMCPServers();
const endHook = await runRuntimeHooks(config.runtimeSettings?.trustedHooks, "SessionEnd", { cwd, session_id: config.sessionId, reason: "exit" });
if (!endHook.allowed) {
    console.error(endHook.messages.join("\n"));
    process.exitCode = 1;
}
//# sourceMappingURL=index.js.map