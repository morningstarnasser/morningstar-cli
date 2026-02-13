#!/usr/bin/env node

import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import React from "react";
import { render } from "ink";
import { program } from "commander";
import { App } from "./app.js";
import { detectProject, buildSystemPrompt } from "./context.js";
import { detectProvider, getProviderBaseUrl, getProviderApiKeyEnv, resolveApiKey } from "./providers.js";
import { loadSettings } from "./settings.js";
import { loadProjectMemory } from "./project-memory.js";
import { getMemoryContext } from "./memory.js";
import { getLastConversation, loadConversation } from "./history.js";
import { runPrintMode } from "./print-mode.js";
import type { CLIConfig, Message } from "./types.js";
import type { MorningstarSettings } from "./settings.js";

// ─── Config ──────────────────────────────────────────────
const VERSION = "1.0.0";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const sessionStart = Date.now();

function loadSavedConfig(): Record<string, unknown> {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveConfig(data: Record<string, unknown>) {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    const existing = loadSavedConfig();
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...data }, null, 2), "utf-8");
  } catch {}
}

function loadEnvFile(dir: string) {
  for (const name of [".env.local", ".env"]) {
    const envPath = join(dir, name);
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (key && !process.env[key]) process.env[key] = val;
        }
      } catch {}
    }
  }
}

const saved = loadSavedConfig();

// ─── Per-Provider API Key Storage ────────────────────────
const savedApiKeys: Record<string, string> = (saved.apiKeys as Record<string, string>) || {};

// Migrate legacy single apiKey
if (saved.apiKey && typeof saved.apiKey === "string" && saved.apiKey !== "ollama") {
  const legacyKey = saved.apiKey as string;
  const keyProvider = saved.provider && saved.provider !== "ollama"
    ? saved.provider as string
    : (legacyKey.startsWith("sk-ant-") ? "anthropic"
      : legacyKey.startsWith("sk-proj-") || legacyKey.startsWith("sk-org-") ? "openai"
      : legacyKey.startsWith("gsk_") ? "groq"
      : "deepseek");
  if (!savedApiKeys[keyProvider]) {
    savedApiKeys[keyProvider] = legacyKey;
    saveConfig({ apiKeys: savedApiKeys });
  }
}

function getStoredApiKey(provider: string): string {
  if (provider === "ollama") return "ollama";
  if (savedApiKeys[provider]) return savedApiKeys[provider];
  const envVar = getProviderApiKeyEnv(provider);
  if (envVar && process.env[envVar]) return process.env[envVar]!;
  return "";
}

function storeApiKey(provider: string, key: string): void {
  if (provider === "ollama" || !key || key === "ollama") return;
  savedApiKeys[provider] = key;
  saveConfig({ apiKeys: savedApiKeys });
}

const DEFAULT_CONFIG: CLIConfig = {
  apiKey: "",
  model: "deepseek-reasoner",
  baseUrl: "https://api.deepseek.com/v1",
  maxTokens: 8192,
  temperature: 0.6,
  provider: undefined,
};

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
const cwd = resolve(opts.dir || process.cwd());
const chatOnly = opts.chat || false;
const skipPermissions: boolean = opts.skipPermissions || opts.dangerouslySkipPermissions || false;

// ─── Settings ─────────────────────────────────────────────
const projectSettings: MorningstarSettings = loadSettings(cwd);

if (projectSettings.env) {
  for (const [key, val] of Object.entries(projectSettings.env)) {
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(cwd);

const selectedModel = opts.model || projectSettings.model || (saved.model as string) || DEFAULT_CONFIG.model;
const selectedProvider = projectSettings.provider || (saved.provider as string) || detectProvider(selectedModel);

const config: CLIConfig = {
  ...DEFAULT_CONFIG,
  model: selectedModel,
  provider: selectedProvider,
  baseUrl: (saved.baseUrl as string) || getProviderBaseUrl(selectedProvider),
  apiKey: opts.apiKey || getStoredApiKey(selectedProvider),
  temperature: projectSettings.temperature ?? DEFAULT_CONFIG.temperature,
  maxTokens: projectSettings.maxTokens ?? DEFAULT_CONFIG.maxTokens,
  // New Claude Code-compatible fields:
  outputFormat: opts.outputFormat || "text",
  verbose: opts.verbose || false,
  quiet: opts.quiet || false,
  allowedTools: (opts.tools || opts.allowedTools) ? (opts.tools || opts.allowedTools).split(",").map((s: string) => s.trim()) : undefined,
  disallowedTools: opts.disallowedTools ? opts.disallowedTools.split(",").map((s: string) => s.trim()) : undefined,
  maxTurns: opts.maxTurns ?? undefined,
  fallbackModel: opts.fallbackModel || undefined,
  fast: opts.fast || false,
  additionalDirs: opts.addDir ? [resolve(opts.addDir)] : undefined,
  // Permission flags:
  dangerouslySkipPermissions: opts.dangerouslySkipPermissions || false,
  permissionMode: opts.permissionMode || undefined,
  // Enhanced CLI flags:
  appendSystemPrompt: opts.appendSystemPrompt || undefined,
  preSelectedAgents: opts.agents ? opts.agents.split(",").map((s: string) => s.trim()) : undefined,
  jsonSchema: opts.jsonSchema || undefined,
  debug: opts.debug || false,
  maxBudgetUsd: opts.maxBudgetUsd ?? undefined,
  forkSession: opts.forkSession || undefined,
  sessionId: opts.sessionId || undefined,
  sandbox: opts.sandbox || false,
};

// ─── System Prompt Override ─────────────────────────────
let systemPromptOverride: string | undefined;
if (opts.systemPrompt) {
  systemPromptOverride = opts.systemPrompt;
} else if (opts.systemPromptFile) {
  try {
    systemPromptOverride = readFileSync(resolve(opts.systemPromptFile), "utf-8");
  } catch (e) {
    console.error(`Error reading system prompt file: ${(e as Error).message}`);
    process.exit(1);
  }
}

// ─── Session Resume ─────────────────────────────────────
let resumedMessages: Message[] | undefined;
if (opts.continue) {
  const last = getLastConversation();
  if (last) {
    resumedMessages = last.messages;
    if (!opts.quiet) console.log(`  Resuming session: ${last.name} (${last.messageCount} messages)`);
  } else {
    if (!opts.quiet) console.log("  No previous session found.");
  }
} else if (opts.resume) {
  const conv = loadConversation(opts.resume);
  if (conv) {
    resumedMessages = conv.messages;
    if (!opts.quiet) console.log(`  Resuming session: ${conv.name} (${conv.messageCount} messages)`);
  } else {
    console.error(`  Session "${opts.resume}" not found.`);
    process.exit(1);
  }
}

// ─── Interactive API Key Setup ───────────────────────────
async function ensureApiKey(): Promise<void> {
  if (config.apiKey && config.apiKey !== "ollama") return;
  if (config.provider === "ollama") { config.apiKey = "ollama"; return; }
  const provName = config.provider || "deepseek";
  const stored = getStoredApiKey(provName);
  if (stored) { config.apiKey = stored; return; }

  // In print mode, don't do interactive setup
  if (opts.print !== undefined) {
    console.error(`No API key for ${provName}. Set via --api-key or environment variable.`);
    process.exit(1);
  }

  const envKey = getProviderApiKeyEnv(provName);
  console.log(`\n  Kein API Key fuer ${provName} gefunden!\n`);
  if (envKey) console.log(`  Setze ${envKey} als Umgebungsvariable oder gib ihn hier ein.`);
  console.log("  Der Key wird dauerhaft gespeichert (pro Provider).\n");
  const setupRl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    setupRl.question(`  ${provName.toUpperCase()} API Key: `, (answer) => {
      setupRl.close();
      const key = answer.trim();
      if (key) {
        config.apiKey = key;
        storeApiKey(provName, key);
        console.log(`\n  API Key fuer ${provName} gespeichert!\n`);
      } else {
        console.log("\n  Kein Key eingegeben. Beende.\n");
        process.exit(1);
      }
      resolve();
    });
  });
}

await ensureApiKey();

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
    if (!opts.quiet) console.log(`  Forked from session: ${forked.name} (${forked.messageCount} messages)`);
  } else {
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
render(
  React.createElement(App, {
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
  })
);
