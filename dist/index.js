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
import { detectProvider, getProviderBaseUrl, getProviderApiKeyEnv } from "./providers.js";
import { loadSettings } from "./settings.js";
// ─── Config ──────────────────────────────────────────────
const VERSION = "1.0.0";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const sessionStart = Date.now();
function loadSavedConfig() {
    try {
        if (existsSync(CONFIG_FILE)) {
            return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
        }
    }
    catch { }
    return {};
}
function saveConfig(data) {
    try {
        if (!existsSync(CONFIG_DIR))
            mkdirSync(CONFIG_DIR, { recursive: true });
        const existing = loadSavedConfig();
        writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...data }, null, 2), "utf-8");
    }
    catch { }
}
function loadEnvFile(dir) {
    for (const name of [".env.local", ".env"]) {
        const envPath = join(dir, name);
        if (existsSync(envPath)) {
            try {
                const content = readFileSync(envPath, "utf-8");
                for (const line of content.split("\n")) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith("#"))
                        continue;
                    const eqIdx = trimmed.indexOf("=");
                    if (eqIdx === -1)
                        continue;
                    const key = trimmed.slice(0, eqIdx).trim();
                    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
                    if (key && !process.env[key])
                        process.env[key] = val;
                }
            }
            catch { }
        }
    }
}
const saved = loadSavedConfig();
// ─── Per-Provider API Key Storage ────────────────────────
const savedApiKeys = saved.apiKeys || {};
// Migrate legacy single apiKey
if (saved.apiKey && typeof saved.apiKey === "string" && saved.apiKey !== "ollama") {
    const legacyKey = saved.apiKey;
    const keyProvider = saved.provider && saved.provider !== "ollama"
        ? saved.provider
        : (legacyKey.startsWith("sk-ant-") ? "anthropic"
            : legacyKey.startsWith("sk-proj-") || legacyKey.startsWith("sk-org-") ? "openai"
                : legacyKey.startsWith("gsk_") ? "groq"
                    : "deepseek");
    if (!savedApiKeys[keyProvider]) {
        savedApiKeys[keyProvider] = legacyKey;
        saveConfig({ apiKeys: savedApiKeys });
    }
}
function getStoredApiKey(provider) {
    if (provider === "ollama")
        return "ollama";
    if (savedApiKeys[provider])
        return savedApiKeys[provider];
    const envVar = getProviderApiKeyEnv(provider);
    if (envVar && process.env[envVar])
        return process.env[envVar];
    return "";
}
function storeApiKey(provider, key) {
    if (provider === "ollama" || !key || key === "ollama")
        return;
    savedApiKeys[provider] = key;
    saveConfig({ apiKeys: savedApiKeys });
}
const DEFAULT_CONFIG = {
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
    .parse();
const opts = program.opts();
const cwd = resolve(opts.dir || process.cwd());
const chatOnly = opts.chat || false;
const skipPermissions = opts.skipPermissions || false;
// ─── Settings ─────────────────────────────────────────────
const projectSettings = loadSettings(cwd);
if (projectSettings.env) {
    for (const [key, val] of Object.entries(projectSettings.env)) {
        if (!process.env[key])
            process.env[key] = val;
    }
}
loadEnvFile(cwd);
const selectedModel = opts.model || projectSettings.model || saved.model || DEFAULT_CONFIG.model;
const selectedProvider = projectSettings.provider || saved.provider || detectProvider(selectedModel);
const config = {
    ...DEFAULT_CONFIG,
    model: selectedModel,
    provider: selectedProvider,
    baseUrl: saved.baseUrl || getProviderBaseUrl(selectedProvider),
    apiKey: opts.apiKey || getStoredApiKey(selectedProvider),
    temperature: projectSettings.temperature ?? DEFAULT_CONFIG.temperature,
    maxTokens: projectSettings.maxTokens ?? DEFAULT_CONFIG.maxTokens,
};
// ─── Interactive API Key Setup ───────────────────────────
async function ensureApiKey() {
    if (config.apiKey && config.apiKey !== "ollama")
        return;
    if (config.provider === "ollama") {
        config.apiKey = "ollama";
        return;
    }
    const provName = config.provider || "deepseek";
    const stored = getStoredApiKey(provName);
    if (stored) {
        config.apiKey = stored;
        return;
    }
    const envKey = getProviderApiKeyEnv(provName);
    console.log(`\n  Kein API Key fuer ${provName} gefunden!\n`);
    if (envKey)
        console.log(`  Setze ${envKey} als Umgebungsvariable oder gib ihn hier ein.`);
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
            }
            else {
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
const baseSystemPrompt = chatOnly
    ? "Du bist Morningstar AI, ein hilfreicher Coding-Assistant. Antworte direkt und effizient."
    : buildSystemPrompt(ctx);
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
}));
//# sourceMappingURL=index.js.map