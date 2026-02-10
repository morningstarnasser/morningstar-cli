#!/usr/bin/env node

import { createInterface, clearLine, cursorTo } from "node:readline";
import { resolve, join, basename } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import chalk from "chalk";
import ora from "ora";
import { program } from "commander";
import { streamChat } from "./ai.js";
import { executeToolCalls, toolStats } from "./tools.js";
import { detectProject, buildSystemPrompt } from "./context.js";
import { AGENTS, getAgentPrompt, listAgents } from "./agents.js";
import type { Agent } from "./agents.js";
import { getAllAgents, createAgent, editAgent, deleteAgent, isBuiltinAgent, loadCustomAgents } from "./custom-agents.js";
import { addMemory, removeMemory, loadMemories, searchMemories, clearMemories, getMemoryContext } from "./memory.js";
import { addTodo, toggleTodo, removeTodo, loadTodos, clearDoneTodos, clearAllTodos, getTodoStats } from "./todo.js";
import { saveConversation, loadConversation, listConversations, deleteConversation, getLastConversation } from "./history.js";
import { undoLastChange, getUndoStack, getUndoStackSize, clearUndoStack, getLastChange } from "./undo.js";
import { THEMES, setTheme, getTheme, getThemeId, listThemes } from "./theme.js";
import type { Message, CLIConfig } from "./types.js";
import { detectProvider, getProviderBaseUrl, getProviderApiKeyEnv, resolveApiKey, listProviders, getModelDisplayName } from "./providers.js";
import { getPermissionMode, setPermissionMode, shouldAskPermission, getCategoryColor } from "./permissions.js";
import { loadProjectMemory, createProjectMemory } from "./project-memory.js";
import { trackUsage, getSessionCosts, formatCostDisplay, resetSessionCosts, isFreeTier } from "./cost-tracker.js";
import { getRepoMap, generateOnboarding, generateProjectScore, generateCodeRoast } from "./repo-map.js";
import { parseMentions, formatMentionContext, getMentionCompletions } from "./mentions.js";
import { VISION_MODELS, DEFAULT_VISION_MODEL, isImageFile, isOllamaRunning as isOllamaRunningAsync, isVisionModelInstalled, pullVisionModel, analyzeImage, getInstalledVisionModels } from "./vision.js";
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL, IMAGE_OUTPUT_DIR, hasPython, isSetupComplete, setupImageGen, generateImage, getAvailableMemoryGB, cleanupImageGen } from "./image-gen.js";
import { startServer, DEFAULT_PORT } from "./server.js";

// ─── Config ──────────────────────────────────────────────
const VERSION = "1.0.0";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const sessionStart = Date.now();

// Load saved config
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

// Load .env from cwd if exists
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
// Keys are stored as apiKeys: { openai: "sk-...", deepseek: "sk-...", ... }
const savedApiKeys: Record<string, string> = (saved.apiKeys as Record<string, string>) || {};

// Migrate legacy single apiKey to per-provider store
if (saved.apiKey && typeof saved.apiKey === "string" && saved.apiKey !== "ollama") {
  const legacyKey = saved.apiKey as string;
  // Determine which provider this key belongs to (not ollama)
  const keyProvider = saved.provider && saved.provider !== "ollama"
    ? saved.provider as string
    : (legacyKey.startsWith("sk-ant-") ? "anthropic"
      : legacyKey.startsWith("sk-proj-") || legacyKey.startsWith("sk-org-") ? "openai"
      : legacyKey.startsWith("gsk_") ? "groq"
      : "deepseek"); // default: DeepSeek (most common for morningstar)
  if (!savedApiKeys[keyProvider]) {
    savedApiKeys[keyProvider] = legacyKey;
    saveConfig({ apiKeys: savedApiKeys });
  }
}

function getStoredApiKey(provider: string): string {
  if (provider === "ollama") return "ollama";
  // 1. Per-provider stored key
  if (savedApiKeys[provider]) return savedApiKeys[provider];
  // 2. Environment variable
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
  .parse();

const opts = program.opts();
const cwd = resolve(opts.dir || process.cwd());
const chatOnly = opts.chat || false;

loadEnvFile(cwd);

const selectedModel = opts.model || (saved.model as string) || DEFAULT_CONFIG.model;
const selectedProvider = (saved.provider as string) || detectProvider(selectedModel);

const config: CLIConfig = {
  ...DEFAULT_CONFIG,
  model: selectedModel,
  provider: selectedProvider,
  baseUrl: (saved.baseUrl as string) || getProviderBaseUrl(selectedProvider),
  apiKey: opts.apiKey || getStoredApiKey(selectedProvider),
};

// ─── Interactive API Key Setup ───────────────────────────
async function ensureApiKey(): Promise<void> {
  if (config.apiKey && config.apiKey !== "ollama") return;
  // Ollama and local providers don't need a key
  if (config.provider === "ollama") { config.apiKey = "ollama"; return; }
  // Try loading stored key for this provider
  const provName = config.provider || "deepseek";
  const stored = getStoredApiKey(provName);
  if (stored) { config.apiKey = stored; return; }
  const envKey = getProviderApiKeyEnv(provName);
  console.log(chalk.yellow(`\n  Kein API Key fuer ${provName} gefunden!\n`));
  if (envKey) console.log(chalk.gray(`  Setze ${envKey} als Umgebungsvariable oder gib ihn hier ein.`));
  console.log(chalk.gray("  Der Key wird dauerhaft gespeichert (pro Provider).\n"));
  const setupRl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    setupRl.question(chalk.cyan(`  ${provName.toUpperCase()} API Key: `), (answer) => {
      setupRl.close();
      const key = answer.trim();
      if (key) {
        config.apiKey = key;
        storeApiKey(provName, key);
        console.log(chalk.green(`\n  API Key fuer ${provName} gespeichert!\n`));
      } else {
        console.log(chalk.red("\n  Kein Key eingegeben. Beende.\n"));
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

// Add memory + project memory context to system prompt
function getFullSystemPrompt(): string {
  let prompt = baseSystemPrompt + getMemoryContext();
  const projectMem = loadProjectMemory(cwd);
  if (projectMem) prompt += `\n\n--- Project Memory (MORNINGSTAR.md) ---\n${projectMem}\n--- Ende ---`;
  return prompt;
}

// ─── State ───────────────────────────────────────────────
const messages: Message[] = [{ role: "system", content: getFullSystemPrompt() }];
let totalTokensEstimate = 0;
let activeAgent: string | null = null;
let isProcessing = false;
let currentAbort: AbortController | null = null;
let planMode = false;
const inputQueue: string[] = [];
let lastProcessingEndTime = 0;

// ─── Theme-aware UI Helpers ──────────────────────────────
const t = () => getTheme();
const STAR = () => chalk.hex(t().star)("*");
const PROMPT = () => chalk.hex(t().prompt).bold("> ");

// ─── Readline State Restore (solves TTY desync after streaming) ──
function restorePrompt(): void {
  try {
    process.stdout.write("\x1b[0m");     // Reset all ANSI attributes
    process.stdout.write("\x1b[?25h");   // Ensure cursor is visible
    process.stdin.resume();               // Ensure stdin is reading
    rl.resume();                          // Ensure readline is not paused
    // Clear current terminal line — readline may have stale cursor position
    clearLine(process.stdout, 0);
    cursorTo(process.stdout, 0);
    // Reset readline's internal line buffer (critical for TTY sync)
    const rlInternal = rl as unknown as { line: string; cursor: number };
    rlInternal.line = "";
    rlInternal.cursor = 0;
    // Set and display prompt
    rl.setPrompt(getPrompt());
    rl.prompt();
  } catch {
    // Absolute fallback — write prompt manually
    process.stdout.write("\r\n" + getPrompt());
  }
}

function printBanner() {
  const theme = t();
  const m = chalk.hex(theme.primary);
  const g = chalk.hex(theme.secondary);
  const w = chalk.hex("#f0abfc");
  const y = chalk.hex(theme.accent);
  const c = chalk.hex(theme.info);
  const d = chalk.hex(theme.dim);
  const b = chalk.bold;

  const BW = 58;
  const empty = d("  \u2551") + " ".repeat(BW) + d("\u2551");
  const center = (rawText: string, coloredText: string) => {
    const left = Math.floor((BW - rawText.length) / 2);
    const right = BW - rawText.length - left;
    return d("  \u2551") + " ".repeat(left) + coloredText + " ".repeat(right) + d("\u2551");
  };

  console.log();
  console.log(d("  \u2554" + "\u2550".repeat(BW) + "\u2557"));
  console.log(empty);
  console.log(center(". .  \u2605  . .",           g(". .  ") + y(b("\u2605")) + g("  . .")));
  console.log(center(".  ./ . \\.  .",         g(".  .") + m(b("/")) + g(" . ") + m(b("\\")) + g(".  .")));
  console.log(center(".  /  . | .  \\  .",     g(".  ") + m(b("/")) + g("  . ") + w(b("|")) + g(" .  ") + m(b("\\")) + g("  .")));
  console.log(center("\u2500\u2500 * \u2500\u2500\u2500\u2500\u2500+\u2500\u2500\u2500\u2500\u2500 * \u2500\u2500", g("\u2500\u2500 ") + m(b("*")) + g(" \u2500\u2500\u2500\u2500\u2500") + y(b("+")) + g("\u2500\u2500\u2500\u2500\u2500 ") + m(b("*")) + g(" \u2500\u2500")));
  console.log(center(".  \\  . | .  /  .",     g(".  ") + m(b("\\")) + g("  . ") + w(b("|")) + g(" .  ") + m(b("/")) + g("  .")));
  console.log(center(".  .\\ . /.  .",         g(".  .") + m(b("\\")) + g(" . ") + m(b("/")) + g(".  .")));
  console.log(center(". .  \u2605  . .",           g(". .  ") + y(b("\u2605")) + g("  . .")));
  console.log(empty);
  console.log(center("M O R N I N G S T A R", m(b("M O R N I N G S T A R"))));
  console.log(d("  \u2551") + "   " + d("\u2501".repeat(BW - 6)) + "   " + d("\u2551"));
  console.log(center("Terminal AI Coding Assistant", w("Terminal AI Coding Assistant")));
  console.log(center("Powered by Mr.Morningstar", d("Powered by") + " " + y(b("Mr.Morningstar"))));
  console.log(center("github.com/morningstarnasser", c("github.com/morningstarnasser")));
  console.log(empty);
  console.log(d("  \u255a" + "\u2550".repeat(BW) + "\u255d"));
  console.log();

  const modelName = getModelDisplayName(config.model);
  const provDisplay = config.provider || detectProvider(config.model);
  const modelRaw = `${modelName} [${provDisplay}]`;
  const modelDisplay = c(modelName) + d(" [") + y(provDisplay) + d("]");
  const langInfo = ctx.language ? ctx.language + (ctx.framework ? " / " + ctx.framework : "") : "unbekannt";
  const langDisplay = ctx.language ? chalk.white(ctx.language) + (ctx.framework ? d(" / ") + y(ctx.framework) : "") : d("unbekannt");
  const cwdShort = cwd.length > 42 ? "..." + cwd.slice(-39) : cwd;

  const infoLines = [
    { raw: `Model    ${modelRaw}`, colored: m(" \u2605 ") + d("Model    ") + modelDisplay },
    { raw: `Projekt  ${ctx.projectName} (${langInfo})`, colored: m(" \u2605 ") + d("Projekt  ") + chalk.white.bold(ctx.projectName) + " " + d("(") + langDisplay + d(")") },
    ...(ctx.hasGit ? [{ raw: `Branch   ${ctx.gitBranch || "unknown"}`, colored: m(" \u2605 ") + d("Branch   ") + y(ctx.gitBranch || "unknown") }] : []),
    { raw: `CWD      ${cwdShort}`, colored: m(" \u2605 ") + d("CWD      ") + chalk.white(cwdShort) },
    { raw: `Theme    ${getTheme().name}`, colored: m(" \u2605 ") + d("Theme    ") + chalk.hex(theme.primary)(theme.name) },
  ];
  const maxW = Math.max(...infoLines.map(l => l.raw.length + 4)) + 2;
  const boxW = Math.max(maxW, 50);

  console.log(d("  \u250c" + "\u2500".repeat(boxW) + "\u2510"));
  for (const line of infoLines) {
    const pad = boxW - line.raw.length - 4;
    console.log(d("  \u2502") + line.colored + " ".repeat(Math.max(1, pad)) + d("\u2502"));
  }
  console.log(d("  \u2514" + "\u2500".repeat(boxW) + "\u2518"));
  console.log();

  const allAgents = getAllAgents();
  const agentNames = Object.entries(allAgents).map(([id, a]) => chalk.hex(a.color)(id));

  console.log(d("  Tools   ") + c("read") + d(" \u00b7 ") + c("write") + d(" \u00b7 ") + c("edit") + d(" \u00b7 ") + c("bash") + d(" \u00b7 ") + c("grep") + d(" \u00b7 ") + c("glob") + d(" \u00b7 ") + c("ls") + d(" \u00b7 ") + c("git"));
  console.log(d("  Agents  ") + agentNames.join(d(" \u00b7 ")));
  console.log(d("  Hilfe   ") + w("/help") + d(" \u00b7 ") + w("/features") + d(" \u00b7 ") + w("/agents") + d(" \u00b7 ") + w("/agent:create") + d(" \u00b7 ") + w("/quit"));
  console.log();

  // Show pending todos
  const todoStats = getTodoStats();
  if (todoStats.open > 0) {
    console.log(d("  ") + chalk.hex(theme.warning)(`  ${todoStats.open} offene Aufgabe(n)`) + d(" \u2014 /todo list"));
  }
  // Show memory count
  const memCount = loadMemories().length;
  if (memCount > 0) {
    console.log(d("  ") + chalk.hex(theme.info)(`  ${memCount} Notiz(en) gespeichert`) + d(" \u2014 /memory list"));
  }

  console.log(d("  " + "\u2500".repeat(60)));
  console.log();
}

function printToolResult(tool: string, result: string, success: boolean, diff?: { filePath: string; oldStr: string; newStr: string }) {
  const icon = success ? chalk.hex(t().success)("\u2713") : chalk.hex(t().error)("\u2717");
  const header = chalk.hex(t().warning)(`[${tool}]`);
  console.log(`\n  ${icon} ${header}`);

  // Show colored diff for edit operations (like Claude Code: red = old, blue = new)
  if (diff && tool === "edit") {
    console.log(chalk.gray(`  ${result}`));
    console.log();
    console.log(chalk.hex(t().dim)(`  ${diff.filePath}:`));
    const oldLines = diff.oldStr.split("\n");
    const newLines = diff.newStr.split("\n");
    const maxDiffLines = 40;
    // Show removed lines in red
    const oldShow = oldLines.slice(0, maxDiffLines);
    for (const line of oldShow) {
      console.log(chalk.red(`  - ${line}`));
    }
    if (oldLines.length > maxDiffLines) console.log(chalk.red(`  ... (+${oldLines.length - maxDiffLines} weitere)`));
    // Show added lines in blue
    const newShow = newLines.slice(0, maxDiffLines);
    for (const line of newShow) {
      console.log(chalk.blueBright(`  + ${line}`));
    }
    if (newLines.length > maxDiffLines) console.log(chalk.blueBright(`  ... (+${newLines.length - maxDiffLines} weitere)`));
  } else {
    const lines = result.split("\n").slice(0, 30);
    for (const line of lines) console.log(chalk.gray(`  ${line}`));
    if (result.split("\n").length > 30) console.log(chalk.gray(`  ...(${result.split("\n").length - 30} weitere Zeilen)`));
  }
  process.stdout.write("\x1b[0m"); // Reset ANSI after tool output
  console.log();
}

// ─── readline question helper ────────────────────────────
function askQuestion(promptRl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    promptRl.question(question, (answer) => resolve(answer));
  });
}

// ─── Print Help ──────────────────────────────────────────
function printHelp() {
  const d = chalk.hex(t().dim);
  const h = chalk.hex(t().primary).bold;
  const w = chalk.white;

  console.log(chalk.hex(t().info)("\n  Morningstar CLI - Alle Befehle:\n"));

  console.log(h("  Allgemein"));
  console.log(w("  /help              ") + d("Diese Hilfe anzeigen"));
  console.log(w("  /features          ") + d("Alle Features anzeigen"));
  console.log(w("  /clear             ") + d("Konversation zuruecksetzen"));
  console.log(w("  /compact           ") + d("Konversation komprimieren"));
  console.log(w("  /quit              ") + d("Beenden"));
  console.log();

  console.log(h("  AI & Model"));
  console.log(w("  /model <id>        ") + d("Model wechseln (alle Provider)"));
  console.log(w("  /provider <name>   ") + d("Provider wechseln (deepseek, openai, anthropic, google, ollama, groq)"));
  console.log(w("  /providers         ") + d("Alle Provider und Models anzeigen"));
  console.log(w("  /context           ") + d("Projekt-Kontext anzeigen"));
  console.log(w("  /cost              ") + d("Token- & Kostentracking anzeigen"));
  console.log(w("  /stats             ") + d("Session-Statistiken"));
  console.log(w("  /permissions       ") + d("Permission-Modus (auto/ask/strict)"));
  console.log(w("  /plan              ") + d("Plan-Modus an/aus (denken vor handeln)"));
  console.log();

  console.log(h("  Agenten"));
  console.log(w("  /agents            ") + d("Verfuegbare Agenten anzeigen"));
  console.log(w("  /agent:<id>        ") + d("Agent aktivieren"));
  console.log(w("  /agent:off         ") + d("Agent deaktivieren"));
  console.log(w("  /agent:create      ") + d("Neuen Agent erstellen"));
  console.log(w("  /agent:edit <id>   ") + d("Custom Agent bearbeiten"));
  console.log(w("  /agent:delete <id> ") + d("Custom Agent loeschen"));
  console.log(w("  /agent:show <id>   ") + d("Agent-Details anzeigen"));
  console.log(w("  /agent:list        ") + d("Alle Agenten auflisten"));
  console.log(w("  /agent:export <id> ") + d("Agent als JSON exportieren"));
  console.log(w("  /agent:import      ") + d("Agent aus JSON importieren"));
  console.log();

  console.log(h("  Notizen & Aufgaben"));
  console.log(w("  /memory add <text> ") + d("Notiz speichern"));
  console.log(w("  /memory list       ") + d("Alle Notizen anzeigen"));
  console.log(w("  /memory search <q> ") + d("Notizen durchsuchen"));
  console.log(w("  /memory remove <n> ") + d("Notiz loeschen"));
  console.log(w("  /memory clear      ") + d("Alle Notizen loeschen"));
  console.log(w("  /todo add <text>   ") + d("Aufgabe hinzufuegen"));
  console.log(w("  /todo list         ") + d("Aufgaben anzeigen"));
  console.log(w("  /todo done <id>    ") + d("Aufgabe als erledigt markieren"));
  console.log(w("  /todo remove <id>  ") + d("Aufgabe loeschen"));
  console.log(w("  /todo clear        ") + d("Erledigte Aufgaben loeschen"));
  console.log();

  console.log(h("  Git"));
  console.log(w("  /diff              ") + d("Git diff anzeigen"));
  console.log(w("  /diff staged       ") + d("Staged changes anzeigen"));
  console.log(w("  /commit            ") + d("Smart Commit (analysiert Aenderungen)"));
  console.log(w("  /log               ") + d("Git log anzeigen"));
  console.log(w("  /branch            ") + d("Branches anzeigen"));
  console.log(w("  /status            ") + d("Git status"));
  console.log();

  console.log(h("  Codebase-Analyse"));
  console.log(w("  /onboard           ") + d("Projekt-Onboarding (Struktur, Dependencies, Scripts)"));
  console.log(w("  /score             ") + d("Projekt-Qualitaetsscore"));
  console.log(w("  /roast             ") + d("Code Roast (humorvolle Review)"));
  console.log(w("  /map               ") + d("Codebase Map (Exports/Imports)"));
  console.log();

  console.log(h("  Dateien & Projekt"));
  console.log(w("  /init              ") + d("MORNINGSTAR.md Projektnotiz erstellen"));
  console.log(w("  /undo              ") + d("Letzte Dateiaenderung rueckgaengig"));
  console.log(w("  /undo list         ") + d("Undo-Stack anzeigen"));
  console.log(w("  /search <query>    ") + d("Im Projekt suchen (grep)"));
  console.log();

  console.log(h("  History & Sessions"));
  console.log(w("  /history save <n>  ") + d("Konversation speichern"));
  console.log(w("  /history list      ") + d("Gespeicherte Sessions"));
  console.log(w("  /history load <id> ") + d("Session laden"));
  console.log(w("  /history delete <id>") + d(" Session loeschen"));
  console.log();

  console.log(h("  @-Mentions (im Prompt)"));
  console.log(w("  @file:<path>       ") + d("Datei als Kontext anhaengen"));
  console.log(w("  @folder:<path>     ") + d("Ordner-Inhalt als Kontext"));
  console.log(w("  @git:diff          ") + d("Git diff als Kontext"));
  console.log(w("  @git:log           ") + d("Git log als Kontext"));
  console.log(w("  @git:status        ") + d("Git status als Kontext"));
  console.log(w("  @git:staged        ") + d("Staged changes als Kontext"));
  console.log(w("  @url:<url>         ") + d("URL-Inhalt als Kontext"));
  console.log(w("  @codebase          ") + d("Codebase-Map als Kontext"));
  console.log();

  console.log(h("  Vision & Bilder"));
  console.log(w("  /vision <path>     ") + d("Bild analysieren (lokal, Ollama)"));
  console.log(w("  /vision models     ") + d("Vision-Modelle anzeigen"));
  console.log(w("  /vision setup      ") + d("Vision-Model installieren"));
  console.log(w("  /imagine <prompt>  ") + d("Bild generieren (Stable Diffusion)"));
  console.log(w("  /imagine setup     ") + d("Image-Gen Umgebung einrichten"));
  console.log(w("  /imagine models    ") + d("Verfuegbare Bild-Modelle"));
  console.log(w("  /serve             ") + d("API Server starten (HTTP)"));
  console.log(w("  /serve <port>      ") + d("Server auf bestimmtem Port"));
  console.log();

  console.log(h("  Darstellung"));
  console.log(w("  /theme             ") + d("Theme anzeigen/wechseln"));
  console.log(w("  /theme <name>      ") + d("Theme setzen (default, ocean, hacker, sunset, nord, rose)"));
  console.log(w("  /config            ") + d("Konfiguration anzeigen"));
  console.log(w("  /config set <k> <v>") + d(" Einstellung aendern"));
  console.log(w("  /doctor            ") + d("Setup diagnostizieren"));
  console.log();
}

// ─── Print Features ──────────────────────────────────────
function printFeatures() {
  const theme = t();
  const d = chalk.hex(theme.dim);
  const h = chalk.hex(theme.info).bold;

  console.log(chalk.hex(theme.primary).bold("\n  " + STAR() + " Morningstar AI \u2014 Alle Features\n"));

  console.log(h("  Multi-Provider AI"));
  console.log(d("  - DeepSeek R1 (Reasoning) + Chat"));
  console.log(d("  - OpenAI GPT-4o, o1, o3-mini"));
  console.log(d("  - Anthropic Claude Sonnet/Opus/Haiku"));
  console.log(d("  - Google Gemini 2.0 Flash/Pro"));
  console.log(d("  - Ollama (lokale Modelle)"));
  console.log(d("  - Groq (Llama, Mixtral)"));
  console.log(d("  - OpenRouter (alle Modelle)"));
  console.log(d("  - Streaming + Plan-Modus + Multi-Turn (5 Runden)"));
  console.log();

  console.log(h("  Tools (9 verfuegbar)"));
  console.log(chalk.white("  read     ") + d("Dateien lesen mit Zeilennummern"));
  console.log(chalk.white("  write    ") + d("Dateien schreiben/erstellen (mit Undo)"));
  console.log(chalk.white("  edit     ") + d("Text ersetzen (mit Undo)"));
  console.log(chalk.white("  delete   ") + d("Dateien loeschen (mit Undo)"));
  console.log(chalk.white("  bash     ") + d("Shell-Befehle ausfuehren"));
  console.log(chalk.white("  grep     ") + d("In Dateien suchen"));
  console.log(chalk.white("  glob     ") + d("Dateien nach Pattern finden"));
  console.log(chalk.white("  ls       ") + d("Verzeichnis auflisten"));
  console.log(chalk.white("  git      ") + d("Git Status + Commits"));
  console.log();

  console.log(h("  Agenten"));
  const allAgents = getAllAgents();
  for (const [id, a] of Object.entries(allAgents)) {
    const tag = isBuiltinAgent(id) ? d("[built-in]") : chalk.hex(theme.secondary)("[custom]");
    console.log(chalk.hex(a.color)(`  /agent:${id.padEnd(12)}`) + tag + " " + d(a.description));
  }
  console.log();

  console.log(h("  Custom Agent System"));
  console.log(d("  - Eigene Agenten erstellen, bearbeiten, loeschen"));
  console.log(d("  - Export/Import als JSON zum Teilen"));
  console.log(d("  - Persistent in ~/.morningstar/agents.json"));
  console.log();

  console.log(h("  Memory System"));
  console.log(d("  - Notizen persistent speichern (/memory add)"));
  console.log(d("  - Werden automatisch in AI-Kontext injiziert"));
  console.log(d("  - Durchsuchbar (/memory search)"));
  console.log();

  console.log(h("  Task Manager"));
  console.log(d("  - Aufgaben mit Prioritaeten (/todo add)"));
  console.log(d("  - Persistent in ~/.morningstar/todo.json"));
  console.log();

  console.log(h("  Git Integration"));
  console.log(d("  - /diff, /diff staged, /commit, /log, /branch, /status"));
  console.log(d("  - Smart Commit analysiert Aenderungen"));
  console.log();

  console.log(h("  Undo System"));
  console.log(d("  - Jede Dateiaenderung (write/edit/delete) wird getrackt"));
  console.log(d("  - /undo macht letzte Aenderung rueckgaengig"));
  console.log(d("  - Stack mit bis zu 50 Aenderungen"));
  console.log();

  console.log(h("  Session History"));
  console.log(d("  - Konversationen speichern und laden"));
  console.log(d("  - Persistent in ~/.morningstar/history/"));
  console.log();

  console.log(h("  Themes"));
  const themes = listThemes();
  console.log(d("  - " + themes.map(t => t.name + (t.active ? " *" : "")).join(", ")));
  console.log();

  console.log(h("  Codebase-Analyse"));
  console.log(d("  - /onboard \u2014 Projekt-Onboarding (Struktur, Dependencies, Scripts)"));
  console.log(d("  - /score \u2014 Qualitaetsscore (Tests, Types, Docs, Security)"));
  console.log(d("  - /roast \u2014 Humorvolle Code-Review"));
  console.log(d("  - /map \u2014 Codebase Map mit Exports/Imports"));
  console.log();

  console.log(h("  @-Mentions"));
  console.log(d("  - @file:path \u2014 Datei als Kontext"));
  console.log(d("  - @folder:path \u2014 Ordner als Kontext"));
  console.log(d("  - @git:diff/log/status/staged \u2014 Git-Info als Kontext"));
  console.log(d("  - @codebase \u2014 Codebase-Map als Kontext"));
  console.log();

  console.log(h("  Vision (Bild-Analyse)"));
  console.log(d("  - Lokale Bild-Analyse mit Ollama (LLaVA, Moondream)"));
  console.log(d("  - Streaming Token-Ausgabe, auto-pull Vision-Model"));
  console.log(d("  - /vision <path> — Bild analysieren"));
  console.log();

  console.log(h("  Image Generation"));
  console.log(d("  - Lokale Bild-Erstellung mit Stable Diffusion"));
  console.log(d("  - SDXL Turbo (1 Step!), SDXL, SD 1.5"));
  console.log(d("  - Apple Silicon MPS + CUDA + CPU Support"));
  console.log(d("  - /imagine <prompt> — Bild generieren"));
  console.log();

  console.log(h("  API Server"));
  console.log(d("  - Selbst-gehosteter HTTP Server (/serve)"));
  console.log(d("  - OpenAI-kompatible Chat Completions API"));
  console.log(d("  - Vision + Image Gen Endpoints"));
  console.log(d("  - CORS, Streaming SSE, Health Check"));
  console.log();

  console.log(h("  Permission System"));
  console.log(d("  - auto \u2014 alle Tools ohne Nachfrage"));
  console.log(d("  - ask \u2014 bei write/edit/delete nachfragen"));
  console.log(d("  - strict \u2014 bei jedem Tool nachfragen"));
  console.log();

  console.log(h("  Cost Tracking"));
  console.log(d("  - Token-Schaetzung pro Message"));
  console.log(d("  - Kostenberechnung per Model (USD)"));
  console.log(d("  - Session-Uebersicht mit /cost"));
  console.log();

  console.log(h("  Projekt-Erkennung"));
  console.log(d("  - TypeScript, JavaScript, Python, Go, Rust, Java"));
  console.log(d("  - Next.js, React, Vue, Svelte, Express, Django, FastAPI"));
  console.log(d("  - Git Branch, Dateistruktur automatisch erkannt"));
  console.log();
}

// ─── Color Choices for Agent Creation ────────────────────
const COLOR_CHOICES = [
  { label: "Rot", hex: "#ef4444" }, { label: "Orange", hex: "#f97316" },
  { label: "Gelb", hex: "#fbbf24" }, { label: "Gruen", hex: "#10b981" },
  { label: "Cyan", hex: "#06b6d4" }, { label: "Blau", hex: "#3b82f6" },
  { label: "Lila", hex: "#a855f7" }, { label: "Pink", hex: "#ec4899" },
];

// ─── Interactive Agent Creation Wizard ───────────────────
async function agentCreateWizard(): Promise<void> {
  console.log(chalk.hex(t().secondary).bold("\n  Neuen Agent erstellen:\n"));
  const wizardRl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const id = (await askQuestion(wizardRl, chalk.gray("  ID (z.B. security): "))).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!id) { console.log(chalk.hex(t().error)("\n  Keine gueltige ID. Abbruch.\n")); wizardRl.close(); return; }
    if (isBuiltinAgent(id)) { console.log(chalk.hex(t().error)(`\n  "${id}" ist ein Built-in Agent.\n`)); wizardRl.close(); return; }
    if (getAllAgents()[id]) { console.log(chalk.hex(t().error)(`\n  Agent "${id}" existiert bereits. Nutze /agent:edit ${id}\n`)); wizardRl.close(); return; }

    const name = (await askQuestion(wizardRl, chalk.gray("  Name: "))).trim();
    if (!name) { console.log(chalk.hex(t().error)("\n  Kein Name. Abbruch.\n")); wizardRl.close(); return; }

    const description = (await askQuestion(wizardRl, chalk.gray("  Beschreibung: "))).trim();

    console.log(chalk.gray("\n  Farbe waehlen:"));
    for (let i = 0; i < COLOR_CHOICES.length; i++) console.log(chalk.hex(COLOR_CHOICES[i].hex)(`  ${i + 1}. ${COLOR_CHOICES[i].label} (${COLOR_CHOICES[i].hex})`));
    console.log(chalk.gray("  9. Eigene (#hex eingeben)"));
    const colorInput = (await askQuestion(wizardRl, chalk.gray("\n  Farbe (1-9): "))).trim();
    const colorNum = parseInt(colorInput, 10);
    let color = "#a855f7";
    if (colorNum >= 1 && colorNum <= 8) color = COLOR_CHOICES[colorNum - 1].hex;
    else if (colorNum === 9 || colorInput.startsWith("#")) {
      const hexInput = colorInput.startsWith("#") ? colorInput : (await askQuestion(wizardRl, chalk.gray("  Hex-Farbe: "))).trim();
      if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) color = hexInput;
    }

    console.log(chalk.gray("\n  System Prompt (mehrzeilig, leere Zeile zum Beenden):"));
    const promptLines: string[] = [];
    while (true) { const line = await askQuestion(wizardRl, chalk.gray("  > ")); if (line === "") break; promptLines.push(line); }
    const sysPrompt = promptLines.join("\n");
    if (!sysPrompt.trim()) { console.log(chalk.hex(t().error)("\n  Kein System Prompt. Abbruch.\n")); wizardRl.close(); return; }
    wizardRl.close();

    const result = createAgent(id, { name, description, systemPrompt: sysPrompt, color });
    if (result.success) { console.log(chalk.hex(t().success)(`\n  \u2713 Agent "${id}" erstellt! Aktiviere mit /agent:${id}\n`)); refreshSlashCommands(); }
    else console.log(chalk.hex(t().error)(`\n  Fehler: ${result.error}\n`));
  } catch { wizardRl.close(); console.log(chalk.hex(t().error)("\n  Abbruch.\n")); }
}

// ─── Interactive Agent Edit ──────────────────────────────
async function agentEditWizard(agentId: string): Promise<void> {
  if (isBuiltinAgent(agentId)) { console.log(chalk.hex(t().error)(`\n  "${agentId}" ist ein Built-in Agent.\n`)); return; }
  const agent = getAllAgents()[agentId];
  if (!agent) { console.log(chalk.hex(t().error)(`\n  Agent "${agentId}" nicht gefunden.\n`)); return; }
  console.log(chalk.hex(t().secondary).bold(`\n  Agent "${agentId}" bearbeiten (Enter = beibehalten):\n`));
  const wizardRl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const newName = (await askQuestion(wizardRl, chalk.gray(`  Name [${agent.name}]: `))).trim() || agent.name;
    const newDesc = (await askQuestion(wizardRl, chalk.gray(`  Beschreibung [${agent.description}]: `))).trim() || agent.description;
    console.log(chalk.gray("  Aktuelle Farbe: ") + chalk.hex(agent.color)(agent.color));
    const colorInput = (await askQuestion(wizardRl, chalk.gray("  Neue Farbe (#hex oder Enter): "))).trim();
    const newColor = /^#[0-9a-fA-F]{6}$/.test(colorInput) ? colorInput : agent.color;

    console.log(chalk.gray("\n  Aktueller System Prompt:"));
    for (const line of agent.systemPrompt.split("\n").slice(0, 5)) console.log(chalk.hex(t().dim)(`    ${line}`));
    if (agent.systemPrompt.split("\n").length > 5) console.log(chalk.hex(t().dim)(`    ...(${agent.systemPrompt.split("\n").length - 5} weitere Zeilen)`));
    const editChoice = (await askQuestion(wizardRl, chalk.gray("\n  System Prompt aendern? (j/n): "))).trim().toLowerCase();
    let newSysPrompt = agent.systemPrompt;
    if (editChoice === "j" || editChoice === "ja" || editChoice === "y") {
      console.log(chalk.gray("  Neuer System Prompt (mehrzeilig, leere Zeile zum Beenden):"));
      const lines: string[] = [];
      while (true) { const line = await askQuestion(wizardRl, chalk.gray("  > ")); if (line === "") break; lines.push(line); }
      if (lines.length > 0) newSysPrompt = lines.join("\n");
    }
    wizardRl.close();
    const result = editAgent(agentId, { name: newName, description: newDesc, color: newColor, systemPrompt: newSysPrompt });
    if (result.success) { console.log(chalk.hex(t().success)(`\n  \u2713 Agent "${agentId}" aktualisiert!\n`)); refreshSlashCommands(); }
    else console.log(chalk.hex(t().error)(`\n  Fehler: ${result.error}\n`));
  } catch { wizardRl.close(); console.log(chalk.hex(t().error)("\n  Abbruch.\n")); }
}

// ─── Agent Delete ────────────────────────────────────────
async function agentDeleteConfirm(agentId: string): Promise<void> {
  if (isBuiltinAgent(agentId)) { console.log(chalk.hex(t().error)(`\n  "${agentId}" ist ein Built-in Agent.\n`)); return; }
  const agent = getAllAgents()[agentId];
  if (!agent) { console.log(chalk.hex(t().error)(`\n  Agent "${agentId}" nicht gefunden.\n`)); return; }
  const confirmRl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await askQuestion(confirmRl, chalk.hex(t().warning)(`  "${agentId}" (${agent.name}) loeschen? (j/n): `));
  confirmRl.close();
  if (answer.trim().toLowerCase() === "j" || answer.trim().toLowerCase() === "ja" || answer.trim().toLowerCase() === "y") {
    const result = deleteAgent(agentId);
    if (result.success) {
      if (activeAgent === agentId) { activeAgent = null; messages[0] = { role: "system", content: getFullSystemPrompt() }; }
      console.log(chalk.hex(t().success)(`\n  \u2713 Agent "${agentId}" geloescht.\n`)); refreshSlashCommands();
    } else console.log(chalk.hex(t().error)(`\n  Fehler: ${result.error}\n`));
  } else console.log(chalk.gray("\n  Abbruch.\n"));
}

// ─── Agent Show ──────────────────────────────────────────
function agentShow(agentId: string): void {
  const agent = getAllAgents()[agentId];
  if (!agent) { console.log(chalk.hex(t().error)(`\n  Agent "${agentId}" nicht gefunden.\n`)); return; }
  const tag = isBuiltinAgent(agentId) ? chalk.gray("[built-in]") : chalk.hex(t().secondary)("[custom]");
  console.log(chalk.hex(agent.color).bold(`\n  ${agent.name}`) + " " + tag);
  console.log(chalk.gray("  ID:           ") + chalk.white(agentId));
  console.log(chalk.gray("  Beschreibung: ") + chalk.white(agent.description));
  console.log(chalk.gray("  Farbe:        ") + chalk.hex(agent.color)(agent.color));
  console.log(chalk.gray("\n  System Prompt:"));
  console.log(chalk.gray("  " + "\u2500".repeat(50)));
  for (const line of agent.systemPrompt.split("\n")) console.log(chalk.white(`  ${line}`));
  console.log(chalk.gray("  " + "\u2500".repeat(50)));
  console.log();
}

// ─── Agent Export ────────────────────────────────────────
function agentExport(agentId: string): void {
  const agent = getAllAgents()[agentId];
  if (!agent) { console.log(chalk.hex(t().error)(`\n  Agent "${agentId}" nicht gefunden.\n`)); return; }
  console.log(chalk.hex(t().success)(`\n  Agent "${agentId}" als JSON:\n`));
  console.log(chalk.white(JSON.stringify({ [agentId]: { name: agent.name, description: agent.description, systemPrompt: agent.systemPrompt, color: agent.color } }, null, 2)));
  console.log(chalk.gray("\n  Kopiere und nutze /agent:import\n"));
}

// ─── Agent Import ────────────────────────────────────────
async function agentImport(): Promise<void> {
  console.log(chalk.hex(t().secondary).bold("\n  Agent aus JSON importieren:\n"));
  console.log(chalk.gray("  JSON eingeben (mehrzeilig, leere Zeile zum Beenden):"));
  const importRl = createInterface({ input: process.stdin, output: process.stdout });
  const lines: string[] = [];
  try {
    while (true) { const line = await askQuestion(importRl, chalk.gray("  > ")); if (line === "") break; lines.push(line); }
    importRl.close();
    const jsonStr = lines.join("\n").trim();
    if (!jsonStr) { console.log(chalk.hex(t().error)("\n  Keine Eingabe.\n")); return; }
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(jsonStr); } catch { console.log(chalk.hex(t().error)("\n  Ungueltiges JSON.\n")); return; }
    let imported = 0;
    for (const [id, data] of Object.entries(parsed)) {
      const a = data as Record<string, unknown>;
      if (!a || typeof a.name !== "string" || typeof a.systemPrompt !== "string") { console.log(chalk.hex(t().warning)(`  Ueberspringe "${id}": Ungueltiges Format.`)); continue; }
      if (isBuiltinAgent(id)) { console.log(chalk.hex(t().warning)(`  Ueberspringe "${id}": Built-in.`)); continue; }
      const result = createAgent(id, { name: a.name, description: (a.description as string) || "", systemPrompt: a.systemPrompt, color: (a.color as string) || "#a855f7" });
      if (result.success) { console.log(chalk.hex(t().success)(`  \u2713 "${id}" importiert.`)); imported++; }
      else { const er = editAgent(id, { name: a.name, description: (a.description as string) || "", systemPrompt: a.systemPrompt, color: (a.color as string) || "#a855f7" }); if (er.success) { console.log(chalk.hex(t().success)(`  \u2713 "${id}" aktualisiert.`)); imported++; } }
    }
    if (imported > 0) { console.log(chalk.hex(t().success)(`\n  ${imported} Agent(en) importiert!\n`)); refreshSlashCommands(); }
    else console.log(chalk.hex(t().warning)("\n  Keine Agents importiert.\n"));
  } catch { importRl.close(); console.log(chalk.hex(t().error)("\n  Abbruch.\n")); }
}

// ─── Ollama Detection ────────────────────────────────────
function getOllamaModels(): { name: string; size: string; modified: string }[] {
  try {
    const output = execSync("ollama list", { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).trim();
    const lines = output.split("\n").slice(1); // skip header
    return lines.filter(l => l.trim()).map(line => {
      const parts = line.split(/\s{2,}/);
      return { name: (parts[0] || "").split(":")[0], size: parts[2] || "", modified: parts[3] || "" };
    }).filter(m => m.name);
  } catch {
    return [];
  }
}

function isOllamaRunning(): boolean {
  try {
    execSync("curl -s http://localhost:11434/api/tags", { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

function isOllamaInstalled(): boolean {
  try {
    execSync("which ollama", { encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const POPULAR_OLLAMA_MODELS = [
  { name: "llama3.2", desc: "Meta Llama 3.2 — 3B, schnell", size: "~2GB" },
  { name: "llama3.1", desc: "Meta Llama 3.1 — 8B, stark", size: "~4.7GB" },
  { name: "codellama", desc: "Meta Code Llama — 7B, Code-spezialisiert", size: "~3.8GB" },
  { name: "deepseek-coder-v2", desc: "DeepSeek Coder V2 — 16B, Coding", size: "~8.9GB" },
  { name: "qwen2.5-coder", desc: "Qwen 2.5 Coder — 7B, Coding", size: "~4.7GB" },
  { name: "mistral", desc: "Mistral 7B — vielseitig", size: "~4.1GB" },
  { name: "phi3", desc: "Microsoft Phi-3 — 3.8B, kompakt", size: "~2.3GB" },
  { name: "gemma2", desc: "Google Gemma 2 — 9B", size: "~5.4GB" },
];

// ─── Interactive Model Selection ─────────────────────────
async function interactiveModelSelect(): Promise<void> {
  const theme = t();
  const d = chalk.hex(theme.dim);
  const h = chalk.hex(theme.primary).bold;
  const w = chalk.white;
  const s = chalk.hex(theme.success);
  const y = chalk.hex(theme.accent);
  const c = chalk.hex(theme.info);

  console.log(h("\n  Model-Auswahl\n"));
  console.log(d("  Aktuell: ") + c(getModelDisplayName(config.model)) + d(" [") + y(config.provider || detectProvider(config.model)) + d("]"));
  console.log();

  // ── Section 1: Local Models (Ollama) ──
  const ollamaOk = isOllamaInstalled();
  const ollamaPath = join(homedir(), ".ollama", "models");

  console.log(h("  1. Lokal (Ollama)") + d(" — offline, kostenlos, privat"));
  if (ollamaOk) {
    console.log(d(`     Pfad: ${ollamaPath}`));
    const running = isOllamaRunning();
    console.log(d("     Status: ") + (running ? s("Laeuft") : chalk.hex(theme.error)("Nicht gestartet") + d(" — starte mit: ollama serve")));

    const installed = getOllamaModels();
    if (installed.length > 0) {
      console.log(s(`\n     Installierte Modelle (${installed.length}):`));
      for (let i = 0; i < installed.length; i++) {
        const m = installed[i];
        const active = config.model === m.name && (config.provider === "ollama") ? y(" \u2605") : "";
        console.log(w(`     ${(i + 1).toString().padStart(2)}. ${m.name}`) + d(` (${m.size})`) + active);
      }
    } else {
      console.log(chalk.hex(theme.warning)("\n     Keine Modelle installiert."));
    }

    console.log(d("\n     Populaere Modelle zum Installieren:"));
    for (const m of POPULAR_OLLAMA_MODELS) {
      const isInstalled = installed.some(i => i.name.startsWith(m.name));
      const tag = isInstalled ? s(" [installiert]") : "";
      console.log(d("     ") + w(`ollama pull ${m.name}`) + d(` — ${m.desc} (${m.size})`) + tag);
    }
  } else {
    console.log(chalk.hex(theme.warning)("     Ollama nicht installiert."));
    console.log(d("     Installieren: ") + c("brew install ollama") + d(" oder ") + c("https://ollama.com"));
    console.log(d(`     Modelle-Pfad: ${ollamaPath}`));
  }

  // ── Section 2: Serverless (Cloud) ──
  console.log(h("\n  2. Serverless (Cloud)") + d(" — schnell, leistungsstark, API Key noetig"));
  const providers = listProviders().filter(p => p.name !== "ollama");
  for (const p of providers) {
    const hasKey = !!getStoredApiKey(p.name);
    const envKey = getProviderApiKeyEnv(p.name);
    const keyTag = p.name === "openrouter" ? d(" (alle Modelle)") :
      hasKey ? s(" [Key gesetzt]") : chalk.hex(theme.warning)(` [${envKey}]`);
    console.log(w(`\n     ${p.name.toUpperCase()}`) + keyTag);
    for (const model of p.models) {
      if (model.startsWith("(")) { console.log(d(`       ${model}`)); continue; }
      const active = config.model === model ? y(" \u2605 aktiv") : "";
      const free = isFreeTier(model) ? s(" (kostenlos)") : "";
      console.log(d("       ") + c(model) + d(` — ${getModelDisplayName(model)}`) + free + active);
    }
  }

  // ── Prompt ──
  console.log(h("\n  Waehle ein Model:"));
  console.log(d("  Eingabe: Nummer (lokal) oder Model-ID (z.B. gpt-4o, llama3)"));
  console.log(d("  Oder: /model <id> direkt\n"));

  const selectRl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await askQuestion(selectRl, chalk.hex(theme.prompt).bold("  Model > "))).trim();
  selectRl.close();

  if (!answer) { console.log(d("\n  Keine Auswahl.\n")); return; }

  // Check if it's a number (local Ollama model)
  const num = parseInt(answer, 10);
  const installed = ollamaOk ? getOllamaModels() : [];
  if (!isNaN(num) && num >= 1 && num <= installed.length) {
    const selected = installed[num - 1].name;
    config.model = selected;
    config.provider = "ollama";
    config.baseUrl = "http://localhost:11434/v1";
    config.apiKey = "ollama";
    saveConfig({ model: selected, provider: "ollama", baseUrl: config.baseUrl });
    console.log(s(`\n  \u2713 Lokal: ${selected} [ollama]\n`));
    return;
  }

  // Check if it's a known model name
  const modelId = answer.toLowerCase();

  // Check if it's an Ollama pull request
  if (modelId.startsWith("pull ") || modelId.startsWith("ollama pull ")) {
    const pullModel = modelId.replace("ollama pull ", "").replace("pull ", "").trim();
    if (pullModel) {
      console.log(chalk.hex(theme.info)(`\n  Lade ${pullModel} herunter...\n`));
      try {
        execSync(`ollama pull ${pullModel}`, { stdio: "inherit", timeout: 600000 });
        config.model = pullModel;
        config.provider = "ollama";
        config.baseUrl = "http://localhost:11434/v1";
        config.apiKey = "ollama";
        saveConfig({ model: pullModel, provider: "ollama", baseUrl: config.baseUrl });
        console.log(s(`\n  \u2713 ${pullModel} installiert und aktiviert!\n`));
      } catch { console.log(chalk.hex(theme.error)("\n  Download fehlgeschlagen.\n")); }
      return;
    }
  }

  // Set as model directly
  const prov = detectProvider(modelId);
  config.model = modelId;
  config.provider = prov;
  config.baseUrl = getProviderBaseUrl(prov);
  config.apiKey = getStoredApiKey(prov);
  saveConfig({ model: modelId, provider: prov, baseUrl: config.baseUrl });
  console.log(s(`\n  \u2713 Model: ${getModelDisplayName(modelId)} [${prov}]\n`));

  // If no valid key for cloud provider, prompt for key
  if (prov !== "ollama" && !config.apiKey) {
    await ensureApiKey();
  }
}

// ─── Git Helpers ─────────────────────────────────────────
function runGit(cmd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 10000, maxBuffer: 1024 * 512 }).trim();
  } catch (e) {
    return `Fehler: ${(e as Error).message}`;
  }
}

// ─── Slash Commands ──────────────────────────────────────
function handleSlashCommand(input: string): boolean | Promise<void> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");

  switch (cmd) {
    case "/help": printHelp(); return true;
    case "/features": printFeatures(); return true;

    // ── Clear ──
    case "/clear":
      messages.length = 1;
      messages[0] = { role: "system", content: getFullSystemPrompt() };
      totalTokensEstimate = 0;
      clearUndoStack();
      console.log(chalk.hex(t().success)("\n  Konversation zurueckgesetzt.\n"));
      return true;

    // ── Model ──
    case "/model":
      if (arg) {
        const newProv = detectProvider(arg);
        config.model = arg;
        config.provider = newProv;
        config.baseUrl = getProviderBaseUrl(newProv);
        config.apiKey = getStoredApiKey(newProv);
        saveConfig({ model: arg, provider: newProv, baseUrl: config.baseUrl });
        console.log(chalk.hex(t().success)(`\n  Model: ${getModelDisplayName(arg)} [${newProv}]\n`));
        if (newProv !== "ollama" && !config.apiKey) {
          return ensureApiKey().then(() => {});
        }
      } else {
        return interactiveModelSelect();
      }
      return true;

    // ── Context ──
    case "/context":
      console.log(chalk.hex(t().info)("\n  Projekt-Kontext:"));
      console.log(chalk.gray(`  CWD: ${ctx.cwd}`));
      console.log(chalk.gray(`  Name: ${ctx.projectName}`));
      console.log(chalk.gray(`  Sprache: ${ctx.language || "unbekannt"}`));
      console.log(chalk.gray(`  Framework: ${ctx.framework || "keins"}`));
      console.log(chalk.gray(`  Git: ${ctx.hasGit ? ctx.gitBranch || "ja" : "nein"}`));
      console.log(chalk.gray(`  Dateien: ${ctx.files.length}\n`));
      return true;

    // ── Cost ──
    case "/cost": {
      const costs = getSessionCosts();
      console.log(chalk.hex(t().info)("\n  Kosten-Tracking:\n"));
      console.log(chalk.white(formatCostDisplay()));
      if (isFreeTier(config.model)) console.log(chalk.hex(t().success)("\n  Aktuelles Model ist kostenlos!"));
      console.log();
      return true;
    }

    // ── Compact ──
    case "/compact": {
      if (messages.length <= 3) { console.log(chalk.gray("\n  Nichts zu komprimieren.\n")); return true; }
      const keep = messages.length > 6 ? messages.slice(-4) : messages.slice(-2);
      messages.length = 1;
      messages.push(...keep);
      console.log(chalk.hex(t().success)(`\n  Komprimiert. ${messages.length} Messages behalten.\n`));
      return true;
    }

    // ── Stats ──
    case "/stats": {
      const elapsed = Math.round((Date.now() - sessionStart) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      console.log(chalk.hex(t().info)("\n  Session-Statistiken:\n"));
      console.log(chalk.gray(`  Laufzeit:        ${mins}m ${secs}s`));
      console.log(chalk.gray(`  Messages:        ${messages.length}`));
      console.log(chalk.gray(`  Tokens (est.):   ~${Math.round(totalTokensEstimate)}`));
      console.log(chalk.gray(`  Tool-Aufrufe:    ${toolStats.calls}`));
      if (Object.keys(toolStats.byTool).length > 0) {
        console.log(chalk.gray("  Tool-Details:    " + Object.entries(toolStats.byTool).map(([k, v]) => `${k}:${v}`).join(", ")));
      }
      console.log(chalk.gray(`  Dateien gelesen: ${toolStats.filesRead}`));
      console.log(chalk.gray(`  Dateien geschrieben: ${toolStats.filesWritten}`));
      console.log(chalk.gray(`  Dateien bearbeitet:  ${toolStats.filesEdited}`));
      console.log(chalk.gray(`  Dateien geloescht:   ${toolStats.filesDeleted}`));
      console.log(chalk.gray(`  Bash-Befehle:    ${toolStats.bashCommands}`));
      console.log(chalk.gray(`  Undo-Stack:      ${getUndoStackSize()} Eintraege`));
      console.log(chalk.gray(`  Model:           ${getModelDisplayName(config.model)}`));
      console.log(chalk.gray(`  Provider:        ${config.provider || detectProvider(config.model)}`));
      console.log(chalk.gray(`  Agent:           ${activeAgent || "keiner"}`));
      console.log(chalk.gray(`  Plan-Modus:      ${planMode ? "AN" : "AUS"}`));
      console.log(chalk.gray(`  Permission:      ${getPermissionMode()}`));
      const costs = getSessionCosts();
      if (costs.messages > 0) console.log(chalk.gray(`  Kosten:          $${costs.totalCost.toFixed(4)}`));
      console.log();
      return true;
    }

    // ── Provider ──
    case "/provider": {
      if (arg) {
        const providers = listProviders();
        const found = providers.find(p => p.name === arg.toLowerCase());
        if (found) {
          config.provider = found.name;
          config.baseUrl = getProviderBaseUrl(found.name);
          const newKey = resolveApiKey(found.name, config.apiKey);
          if (newKey) config.apiKey = newKey;
          // Set a sensible default model for the provider
          const defaultModel = found.models[0];
          if (defaultModel && !defaultModel.startsWith("(")) {
            config.model = defaultModel;
            saveConfig({ provider: found.name, model: defaultModel, baseUrl: config.baseUrl });
            console.log(chalk.hex(t().success)(`\n  Provider: ${found.name}, Model: ${getModelDisplayName(defaultModel)}\n`));
          } else {
            saveConfig({ provider: found.name, baseUrl: config.baseUrl });
            console.log(chalk.hex(t().success)(`\n  Provider: ${found.name}\n`));
          }
        } else {
          console.log(chalk.hex(t().error)(`\n  Provider "${arg}" nicht gefunden.`));
          console.log(chalk.gray("  Verfuegbar: " + providers.map(p => p.name).join(", ") + "\n"));
        }
      } else {
        console.log(chalk.hex(t().info)(`\n  Provider: ${config.provider || detectProvider(config.model)}`));
        console.log(chalk.gray("  /provider <name> zum Wechseln, /providers fuer Uebersicht\n"));
      }
      return true;
    }

    case "/providers": {
      const providers = listProviders();
      console.log(chalk.hex(t().info)("\n  Verfuegbare Provider:\n"));
      for (const p of providers) {
        const active = p.name === (config.provider || detectProvider(config.model));
        const marker = active ? chalk.hex(t().accent)(" \u2605") : "";
        const keyStatus = p.envKey === "(lokal)" ? chalk.hex(t().success)("lokal") :
          process.env[p.envKey] ? chalk.hex(t().success)("Key gesetzt") : chalk.hex(t().dim)("kein Key");
        console.log(chalk.hex(t().primary).bold(`  ${p.name}`) + marker);
        console.log(chalk.gray(`    Models: ${p.models.join(", ")}`));
        console.log(chalk.gray(`    API Key: ${p.envKey}`) + " " + keyStatus);
      }
      console.log(chalk.gray("\n  /provider <name> zum Wechseln, /model <id> fuer Model\n"));
      return true;
    }

    // ── Permissions ──
    case "/permissions": {
      if (arg && ["auto", "ask", "strict"].includes(arg.toLowerCase())) {
        const mode = arg.toLowerCase() as "auto" | "ask" | "strict";
        setPermissionMode(mode);
        const labels: Record<string, string> = { auto: "Automatisch (alle Tools)", ask: "Nachfragen (bei Schreibzugriff)", strict: "Strikt (bei jedem Tool)" };
        console.log(chalk.hex(t().success)(`\n  Permission-Modus: ${labels[mode]}\n`));
      } else {
        const current = getPermissionMode();
        console.log(chalk.hex(t().info)(`\n  Permission-Modus: ${current}`));
        console.log(chalk.gray("  auto   \u2014 alle Tools ohne Nachfrage"));
        console.log(chalk.gray("  ask    \u2014 bei write/edit/delete nachfragen"));
        console.log(chalk.gray("  strict \u2014 bei jedem Tool nachfragen"));
        console.log(chalk.gray("\n  /permissions <mode> zum Aendern\n"));
      }
      return true;
    }

    // ── Codebase Analysis ──
    case "/onboard": {
      console.log(chalk.hex(t().info)("\n  Projekt-Onboarding...\n"));
      const onboarding = generateOnboarding(cwd);
      console.log(chalk.white(onboarding));
      console.log();
      return true;
    }

    case "/score": {
      console.log(chalk.hex(t().info)("\n  Projekt-Score wird berechnet...\n"));
      const score = generateProjectScore(cwd);
      const bar = (label: string, val: number) => {
        const filled = Math.round(val / 5);
        const empty = 20 - filled;
        const color = val >= 70 ? t().success : val >= 40 ? t().warning : t().error;
        return `  ${label.padEnd(16)} ${chalk.hex(color)("\u2588".repeat(filled))}${chalk.hex(t().dim)("\u2591".repeat(empty))} ${val}%`;
      };
      console.log(bar("Quality", score.quality));
      console.log(bar("Test Coverage", score.testCoverage));
      console.log(bar("Type Safety", score.typeSafety));
      console.log(bar("Documentation", score.documentation));
      console.log(bar("Security", score.security));
      console.log(chalk.hex(t().primary).bold(`\n  Overall: ${score.overall}%`));
      if (score.quickWins.length > 0) {
        console.log(chalk.hex(t().accent)("\n  Quick Wins:"));
        for (const win of score.quickWins) console.log(chalk.gray(`    ${win}`));
      }
      console.log();
      return true;
    }

    case "/roast": {
      console.log(chalk.hex(t().info)("\n  Code Roast...\n"));
      const roast = generateCodeRoast(cwd);
      console.log(chalk.white(roast));
      console.log();
      return true;
    }

    case "/map": {
      console.log(chalk.hex(t().info)("\n  Codebase Map...\n"));
      const map = getRepoMap(cwd);
      if (map.length === 0) { console.log(chalk.gray("  Keine Code-Dateien gefunden.\n")); return true; }
      for (const file of map.slice(0, 50)) {
        console.log(chalk.hex(t().accent)(`  ${file.path}`) + chalk.gray(` (${file.lines} Zeilen)`));
        if (file.exports.length > 0) console.log(chalk.hex(t().success)(`    exports: ${file.exports.join(", ")}`));
        if (file.imports.length > 0) console.log(chalk.hex(t().dim)(`    imports: ${file.imports.join(", ")}`));
      }
      if (map.length > 50) console.log(chalk.gray(`\n  ... +${map.length - 50} weitere Dateien`));
      console.log();
      return true;
    }

    // ── Plan Mode ──
    case "/plan":
      planMode = !planMode;
      if (planMode) {
        console.log(chalk.hex(t().warning)("\n  Plan-Modus AN \u2014 KI wird erst planen, dann handeln."));
        console.log(chalk.gray("  Die KI wird zuerst einen Plan erstellen und auf Bestaetigung warten.\n"));
      } else {
        console.log(chalk.hex(t().success)("\n  Plan-Modus AUS \u2014 KI handelt direkt.\n"));
      }
      return true;

    // ── Agents ──
    case "/agents":
    case "/agent:list": {
      const allAgents = getAllAgents();
      const custom = loadCustomAgents();
      const customCount = Object.keys(custom).length;
      console.log(chalk.hex(t().info)("\n  Built-in Agenten:\n"));
      console.log(listAgents(AGENTS));
      if (customCount > 0) {
        console.log(chalk.hex(t().secondary)("\n  Custom Agenten:\n"));
        console.log(listAgents(allAgents, true));
      } else {
        console.log(chalk.gray("\n  Keine Custom Agents vorhanden."));
        console.log(chalk.gray("  Erstelle deinen ersten mit /agent:create\n"));
      }
      if (activeAgent) { const a = allAgents[activeAgent]; console.log(chalk.hex(t().warning)(`  Aktiv: ${a?.name || activeAgent}`)); }
      console.log(chalk.gray("\n  /agent:<id> zum Aktivieren \u00b7 /agent:off zum Deaktivieren\n"));
      return true;
    }
    case "/agent:create": return agentCreateWizard();
    case "/agent:import": return agentImport();

    // ── Memory ──
    case "/memory": {
      const subCmd = parts[1]?.toLowerCase();
      const memArg = parts.slice(2).join(" ");
      if (!subCmd || subCmd === "list") {
        const mems = loadMemories();
        if (mems.length === 0) { console.log(chalk.gray("\n  Keine Notizen gespeichert. Nutze /memory add <text>\n")); return true; }
        console.log(chalk.hex(t().info)("\n  Gespeicherte Notizen:\n"));
        for (const m of mems) {
          const tags = m.tags.length > 0 ? chalk.hex(t().secondary)(` [${m.tags.join(", ")}]`) : "";
          console.log(chalk.gray(`  #${m.id}  `) + chalk.white(m.text) + tags);
        }
        console.log();
        return true;
      }
      if (subCmd === "add") {
        if (!memArg) { console.log(chalk.hex(t().error)("\n  Nutzung: /memory add <text> [#tag1 #tag2]\n")); return true; }
        const tags = memArg.match(/#\w+/g)?.map(t => t.slice(1)) || [];
        const text = memArg.replace(/#\w+/g, "").trim();
        const entry = addMemory(text, tags);
        // Update system prompt with new memory
        messages[0] = { role: "system", content: activeAgent ? getAgentPrompt(activeAgent, getFullSystemPrompt(), getAllAgents()) : getFullSystemPrompt() };
        console.log(chalk.hex(t().success)(`\n  \u2713 Notiz #${entry.id} gespeichert.\n`));
        return true;
      }
      if (subCmd === "search") {
        if (!memArg) { console.log(chalk.hex(t().error)("\n  Nutzung: /memory search <query>\n")); return true; }
        const results = searchMemories(memArg);
        if (results.length === 0) { console.log(chalk.gray(`\n  Keine Treffer fuer "${memArg}".\n`)); return true; }
        console.log(chalk.hex(t().info)(`\n  Treffer fuer "${memArg}":\n`));
        for (const m of results) console.log(chalk.gray(`  #${m.id}  `) + chalk.white(m.text));
        console.log();
        return true;
      }
      if (subCmd === "remove" || subCmd === "delete") {
        const id = parseInt(memArg, 10);
        if (isNaN(id)) { console.log(chalk.hex(t().error)("\n  Nutzung: /memory remove <id>\n")); return true; }
        if (removeMemory(id)) { console.log(chalk.hex(t().success)(`\n  \u2713 Notiz #${id} geloescht.\n`)); messages[0] = { role: "system", content: activeAgent ? getAgentPrompt(activeAgent, getFullSystemPrompt(), getAllAgents()) : getFullSystemPrompt() }; }
        else console.log(chalk.hex(t().error)(`\n  Notiz #${id} nicht gefunden.\n`));
        return true;
      }
      if (subCmd === "clear") {
        const count = clearMemories();
        messages[0] = { role: "system", content: activeAgent ? getAgentPrompt(activeAgent, getFullSystemPrompt(), getAllAgents()) : getFullSystemPrompt() };
        console.log(chalk.hex(t().success)(`\n  \u2713 ${count} Notiz(en) geloescht.\n`));
        return true;
      }
      console.log(chalk.hex(t().error)("\n  Nutzung: /memory add|list|search|remove|clear\n"));
      return true;
    }

    // ── Todo ──
    case "/todo": {
      const subCmd = parts[1]?.toLowerCase();
      const todoArg = parts.slice(2).join(" ");
      if (!subCmd || subCmd === "list") {
        const todos = loadTodos();
        if (todos.length === 0) { console.log(chalk.gray("\n  Keine Aufgaben. Nutze /todo add <text>\n")); return true; }
        console.log(chalk.hex(t().info)("\n  Aufgaben:\n"));
        for (const td of todos) {
          const check = td.done ? chalk.hex(t().success)("\u2713") : chalk.hex(t().dim)("\u25cb");
          const prio = td.priority === "high" ? chalk.hex(t().error)(" !!") : td.priority === "low" ? chalk.hex(t().dim)(" \u2193") : "";
          const text = td.done ? chalk.strikethrough.hex(t().dim)(td.text) : chalk.white(td.text);
          console.log(`  ${check} ${chalk.gray("#" + td.id)} ${text}${prio}`);
        }
        const stats = getTodoStats();
        console.log(chalk.gray(`\n  ${stats.done}/${stats.total} erledigt${stats.high > 0 ? `, ${stats.high} wichtig` : ""}\n`));
        return true;
      }
      if (subCmd === "add") {
        if (!todoArg) { console.log(chalk.hex(t().error)("\n  Nutzung: /todo add <text> [!high|!low]\n")); return true; }
        let priority: "low" | "normal" | "high" = "normal";
        let text = todoArg;
        if (todoArg.includes("!high")) { priority = "high"; text = todoArg.replace("!high", "").trim(); }
        else if (todoArg.includes("!low")) { priority = "low"; text = todoArg.replace("!low", "").trim(); }
        const item = addTodo(text, priority);
        console.log(chalk.hex(t().success)(`\n  \u2713 Aufgabe #${item.id} hinzugefuegt.\n`));
        return true;
      }
      if (subCmd === "done" || subCmd === "toggle") {
        const id = parseInt(todoArg, 10);
        if (isNaN(id)) { console.log(chalk.hex(t().error)("\n  Nutzung: /todo done <id>\n")); return true; }
        const item = toggleTodo(id);
        if (item) console.log(chalk.hex(t().success)(`\n  \u2713 #${id} ${item.done ? "erledigt" : "wieder offen"}.\n`));
        else console.log(chalk.hex(t().error)(`\n  Aufgabe #${id} nicht gefunden.\n`));
        return true;
      }
      if (subCmd === "remove" || subCmd === "delete") {
        const id = parseInt(todoArg, 10);
        if (isNaN(id)) { console.log(chalk.hex(t().error)("\n  Nutzung: /todo remove <id>\n")); return true; }
        if (removeTodo(id)) console.log(chalk.hex(t().success)(`\n  \u2713 Aufgabe #${id} geloescht.\n`));
        else console.log(chalk.hex(t().error)(`\n  Aufgabe #${id} nicht gefunden.\n`));
        return true;
      }
      if (subCmd === "clear") {
        if (todoArg === "all") { const c = clearAllTodos(); console.log(chalk.hex(t().success)(`\n  \u2713 ${c} Aufgabe(n) geloescht.\n`)); }
        else { const c = clearDoneTodos(); console.log(chalk.hex(t().success)(`\n  \u2713 ${c} erledigte Aufgabe(n) entfernt.\n`)); }
        return true;
      }
      console.log(chalk.hex(t().error)("\n  Nutzung: /todo add|list|done|remove|clear\n"));
      return true;
    }

    // ── Git Commands ──
    case "/diff":
      if (arg === "staged") { const d = runGit("git diff --cached"); console.log(d ? chalk.white(`\n${d}\n`) : chalk.gray("\n  Keine staged Aenderungen.\n")); }
      else { const d = runGit("git diff"); console.log(d ? chalk.white(`\n${d}\n`) : chalk.gray("\n  Keine Aenderungen.\n")); }
      return true;

    case "/status": {
      const s = runGit("git status");
      console.log(chalk.white(`\n${s}\n`));
      return true;
    }

    case "/log": {
      const count = arg ? parseInt(arg, 10) || 10 : 10;
      const l = runGit(`git log --oneline -${count}`);
      console.log(chalk.white(`\n${l}\n`));
      return true;
    }

    case "/branch": {
      const b = runGit("git branch -a");
      console.log(chalk.white(`\n${b}\n`));
      return true;
    }

    case "/commit": {
      const status = runGit("git status --short");
      if (!status || status.startsWith("Fehler")) { console.log(chalk.gray("\n  Keine Aenderungen zum Committen.\n")); return true; }
      console.log(chalk.hex(t().info)("\n  Aenderungen:"));
      console.log(chalk.white(`${status}\n`));
      const commitRl = createInterface({ input: process.stdin, output: process.stdout });
      return (async () => {
        const msg = (await askQuestion(commitRl, chalk.gray("  Commit-Message: "))).trim();
        commitRl.close();
        if (!msg) { console.log(chalk.gray("\n  Abbruch.\n")); return; }
        const stageAll = (await (async () => { const rl2 = createInterface({ input: process.stdin, output: process.stdout }); const a = await askQuestion(rl2, chalk.gray("  Alle Dateien stagen? (j/n): ")); rl2.close(); return a; })()).trim().toLowerCase();
        if (stageAll === "j" || stageAll === "ja" || stageAll === "y") runGit("git add -A");
        const result = runGit(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
        console.log(chalk.hex(t().success)(`\n  ${result}\n`));
      })();
    }

    // ── Init ──
    case "/init": {
      const mdPath = join(cwd, "MORNINGSTAR.md");
      if (existsSync(mdPath)) { console.log(chalk.hex(t().warning)("\n  MORNINGSTAR.md existiert bereits.\n")); return true; }
      const content = `# ${ctx.projectName}\n\n## Projekt-Notizen\n\n- Sprache: ${ctx.language || "unbekannt"}\n- Framework: ${ctx.framework || "keins"}\n- Erstellt: ${new Date().toISOString().split("T")[0]}\n\n## Konventionen\n\n- \n\n## Wichtige Dateien\n\n- \n\n## TODOs\n\n- [ ] \n`;
      writeFileSync(mdPath, content, "utf-8");
      console.log(chalk.hex(t().success)("\n  \u2713 MORNINGSTAR.md erstellt!\n"));
      return true;
    }

    // ── Undo ──
    case "/undo": {
      if (arg === "list") {
        const stack = getUndoStack();
        if (stack.length === 0) { console.log(chalk.gray("\n  Undo-Stack ist leer.\n")); return true; }
        console.log(chalk.hex(t().info)("\n  Undo-Stack:\n"));
        for (let i = stack.length - 1; i >= 0; i--) {
          const c = stack[i];
          const marker = i === stack.length - 1 ? chalk.hex(t().accent)("\u2192 ") : "  ";
          console.log(`${marker}${chalk.gray(`[${c.type}]`)} ${chalk.white(c.description)} ${chalk.hex(t().dim)(c.timestamp.split("T")[1]?.slice(0, 8) || "")}`);
        }
        console.log();
        return true;
      }
      const result = undoLastChange();
      if (result.success) console.log(chalk.hex(t().success)(`\n  \u2713 ${result.message}\n`));
      else console.log(chalk.hex(t().error)(`\n  ${result.message}\n`));
      return true;
    }

    // ── Search ──
    case "/search": {
      if (!arg) { console.log(chalk.hex(t().error)("\n  Nutzung: /search <query>\n")); return true; }
      try {
        const results = execSync(`grep -rn "${arg.replace(/"/g, '\\"')}" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" --include="*.rs" --include="*.java" --include="*.css" --include="*.json" --include="*.md" 2>/dev/null | head -30`, { cwd, encoding: "utf-8", timeout: 10000, maxBuffer: 1024 * 512 }).trim();
        if (results) { console.log(chalk.hex(t().info)(`\n  Treffer fuer "${arg}":\n`)); console.log(chalk.white(results)); console.log(); }
        else console.log(chalk.gray(`\n  Keine Treffer fuer "${arg}".\n`));
      } catch { console.log(chalk.gray(`\n  Keine Treffer fuer "${arg}".\n`)); }
      return true;
    }

    // ── History ──
    case "/history": {
      const subCmd = parts[1]?.toLowerCase();
      if (!subCmd || subCmd === "list") {
        const convs = listConversations();
        if (convs.length === 0) { console.log(chalk.gray("\n  Keine gespeicherten Sessions. Nutze /history save <name>\n")); return true; }
        console.log(chalk.hex(t().info)("\n  Gespeicherte Sessions:\n"));
        for (const c of convs.slice(0, 20)) {
          const date = c.savedAt.split("T")[0];
          console.log(chalk.gray(`  ${c.id}  `) + chalk.white(c.name) + chalk.gray(` (${c.messageCount} msgs, ${date}, ${c.project})`));
        }
        console.log(chalk.gray("\n  /history load <id> zum Laden\n"));
        return true;
      }
      if (subCmd === "save") {
        const name = parts.slice(2).join(" ") || `Session ${new Date().toLocaleString("de-DE")}`;
        const conv = saveConversation(name, messages, config.model, ctx.projectName);
        console.log(chalk.hex(t().success)(`\n  \u2713 Session gespeichert: ${conv.id} "${name}"\n`));
        return true;
      }
      if (subCmd === "load") {
        const id = parts[2];
        if (!id) { console.log(chalk.hex(t().error)("\n  Nutzung: /history load <id>\n")); return true; }
        const conv = loadConversation(id);
        if (!conv) { console.log(chalk.hex(t().error)(`\n  Session "${id}" nicht gefunden.\n`)); return true; }
        messages.length = 0;
        messages.push(...conv.messages);
        console.log(chalk.hex(t().success)(`\n  \u2713 Session "${conv.name}" geladen (${conv.messageCount} messages).\n`));
        return true;
      }
      if (subCmd === "delete") {
        const id = parts[2];
        if (!id) { console.log(chalk.hex(t().error)("\n  Nutzung: /history delete <id>\n")); return true; }
        if (deleteConversation(id)) console.log(chalk.hex(t().success)(`\n  \u2713 Session "${id}" geloescht.\n`));
        else console.log(chalk.hex(t().error)(`\n  Session "${id}" nicht gefunden.\n`));
        return true;
      }
      console.log(chalk.hex(t().error)("\n  Nutzung: /history save|list|load|delete\n"));
      return true;
    }

    // ── Theme ──
    case "/theme": {
      if (!arg) {
        const themes = listThemes();
        console.log(chalk.hex(t().info)("\n  Verfuegbare Themes:\n"));
        for (const th of themes) {
          const active = th.active ? chalk.hex(t().accent)(" \u2605 aktiv") : "";
          const preview = THEMES[th.id];
          console.log("  " + chalk.hex(preview.primary)(`\u2588\u2588`) + chalk.hex(preview.secondary)(`\u2588\u2588`) + chalk.hex(preview.accent)(`\u2588\u2588`) + chalk.hex(preview.info)(`\u2588\u2588`) + " " + chalk.white(th.name) + active);
        }
        console.log(chalk.gray("\n  /theme <name> zum Wechseln\n"));
        return true;
      }
      if (setTheme(arg)) { console.log(chalk.hex(getTheme().success)(`\n  \u2713 Theme: ${getTheme().name}\n`)); saveConfig({ theme: arg }); }
      else { console.log(chalk.hex(t().error)(`\n  Theme "${arg}" nicht gefunden.`)); console.log(chalk.gray("  Verfuegbar: " + Object.keys(THEMES).join(", ") + "\n")); }
      return true;
    }

    // ── Config ──
    case "/config": {
      if (parts[1]?.toLowerCase() === "set" && parts[2]) {
        const key = parts[2];
        const val = parts.slice(3).join(" ");
        if (!val) { console.log(chalk.hex(t().error)("\n  Nutzung: /config set <key> <value>\n")); return true; }
        const validKeys = ["apiKey", "model", "baseUrl", "maxTokens", "temperature", "theme", "provider"];
        if (!validKeys.includes(key)) { console.log(chalk.hex(t().error)(`\n  Ungueltig. Verfuegbar: ${validKeys.join(", ")}\n`)); return true; }
        if (key === "maxTokens") (config as unknown as Record<string, unknown>)[key] = parseInt(val, 10);
        else if (key === "temperature") (config as unknown as Record<string, unknown>)[key] = parseFloat(val);
        else if (key === "theme") { setTheme(val); }
        else if (key === "apiKey") {
          config.apiKey = val;
          storeApiKey(config.provider || detectProvider(config.model), val);
        }
        else (config as unknown as Record<string, unknown>)[key] = val;
        if (key !== "apiKey") saveConfig({ [key]: (config as unknown as Record<string, unknown>)[key] });
        console.log(chalk.hex(t().success)(`\n  \u2713 ${key} = ${val}\n`));
        return true;
      }
      console.log(chalk.hex(t().info)("\n  Konfiguration:\n"));
      console.log(chalk.gray("  provider:    ") + chalk.white(config.provider || detectProvider(config.model)));
      console.log(chalk.gray("  model:       ") + chalk.white(getModelDisplayName(config.model)));
      console.log(chalk.gray("  baseUrl:     ") + chalk.white(config.baseUrl));
      console.log(chalk.gray("\n  API Keys (pro Provider):"));
      const allProvs = ["deepseek", "openai", "anthropic", "google", "groq", "openrouter"];
      for (const pv of allProvs) {
        const k = getStoredApiKey(pv);
        const tag = k ? chalk.green(k.slice(0, 8) + "..." + k.slice(-4)) : chalk.hex(t().dim)("(nicht gesetzt)");
        const active = pv === (config.provider || detectProvider(config.model)) ? chalk.hex(t().accent)(" *") : "";
        console.log(chalk.gray(`    ${pv.padEnd(12)}`), tag + active);
      }
      console.log(chalk.gray("  maxTokens:   ") + chalk.white(String(config.maxTokens)));
      console.log(chalk.gray("  temperature: ") + chalk.white(String(config.temperature)));
      console.log(chalk.gray("  theme:       ") + chalk.white(getThemeId()));
      console.log(chalk.gray("  configDir:   ") + chalk.white(CONFIG_DIR));
      console.log(chalk.gray("\n  /config set <key> <value> zum Aendern\n"));
      return true;
    }

    // ── Doctor ──
    case "/doctor": {
      console.log(chalk.hex(t().info)("\n  Morningstar Diagnose:\n"));
      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

      // Node version
      const nodeV = process.version;
      checks.push({ name: "Node.js", ok: parseInt(nodeV.slice(1)) >= 18, detail: nodeV });

      // API Key
      checks.push({ name: "API Key", ok: !!config.apiKey, detail: config.apiKey ? "gesetzt (" + config.apiKey.slice(0, 8) + "...)" : "FEHLT" });

      // Config dir
      checks.push({ name: "Config Dir", ok: existsSync(CONFIG_DIR), detail: CONFIG_DIR });

      // Git
      let gitOk = false;
      try { execSync("git --version", { encoding: "utf-8", timeout: 3000 }); gitOk = true; } catch {}
      checks.push({ name: "Git", ok: gitOk, detail: gitOk ? "installiert" : "nicht gefunden" });

      // Git repo
      checks.push({ name: "Git Repo", ok: ctx.hasGit, detail: ctx.hasGit ? `Branch: ${ctx.gitBranch}` : "kein .git Verzeichnis" });

      // Project
      checks.push({ name: "Projekt", ok: !!ctx.language, detail: ctx.language ? `${ctx.language}${ctx.framework ? " / " + ctx.framework : ""}` : "nicht erkannt" });

      // TypeScript
      let tsOk = false;
      try { execSync("npx tsc --version", { cwd, encoding: "utf-8", timeout: 5000 }); tsOk = true; } catch {}
      checks.push({ name: "TypeScript", ok: tsOk, detail: tsOk ? "verfuegbar" : "nicht gefunden" });

      // Provider
      const provName = config.provider || detectProvider(config.model);
      checks.push({ name: "Provider", ok: true, detail: `${provName} (${getModelDisplayName(config.model)})` });

      // Project Memory
      const projMem = loadProjectMemory(cwd);
      checks.push({ name: "MORNINGSTAR.md", ok: !!projMem, detail: projMem ? "gefunden" : "nicht vorhanden (/init)" });

      // Permission
      checks.push({ name: "Permissions", ok: true, detail: getPermissionMode() });

      // Memory
      const memCount = loadMemories().length;
      checks.push({ name: "Notizen", ok: true, detail: `${memCount} gespeichert` });

      // Custom agents
      const customCount = Object.keys(loadCustomAgents()).length;
      checks.push({ name: "Custom Agents", ok: true, detail: `${customCount} erstellt` });

      for (const c of checks) {
        const icon = c.ok ? chalk.hex(t().success)("\u2713") : chalk.hex(t().error)("\u2717");
        console.log(`  ${icon} ${chalk.white(c.name.padEnd(15))} ${chalk.gray(c.detail)}`);
      }
      console.log();
      return true;
    }

    // ── Vision ──
    case "/vision":
      if (!arg) {
        console.log(chalk.hex(t().info)("\n  Nutzung: /vision <bild-pfad> [frage]"));
        console.log(chalk.gray("  Beispiel: /vision screenshot.png Was zeigt dieses Bild?"));
        console.log(chalk.gray("  /vision models — Verfuegbare Modelle"));
        console.log(chalk.gray("  /vision setup  — Vision-Model installieren\n"));
        return true;
      }
      if (arg === "models") {
        return (async () => {
          console.log(chalk.hex(t().info)("\n  Vision-Modelle (Ollama, lokal):\n"));
          const installed = await getInstalledVisionModels();
          for (const m of VISION_MODELS) {
            const tag = installed.some(i => i.startsWith(m.id)) ? chalk.hex(t().success)(" [installiert]") : chalk.gray(" [nicht installiert]");
            console.log(`  ${chalk.white(m.id.padEnd(16))} ${chalk.gray(m.size.padEnd(6))} ${chalk.hex(t().dim)(m.description)}${tag}`);
          }
          console.log(chalk.gray(`\n  Installieren: /vision setup <model-id>\n`));
        })();
      }
      return (async () => {
        if (arg === "setup" || arg.startsWith("setup ")) {
          const modelId = parts[2] || DEFAULT_VISION_MODEL;
          if (!isOllamaRunning()) { console.log(chalk.hex(t().error)("\n  Ollama laeuft nicht! Starte: ollama serve\n")); return; }
          if (await isVisionModelInstalled(modelId)) { console.log(chalk.hex(t().success)(`\n  Vision-Model '${modelId}' bereits installiert.\n`)); return; }
          const spinner = ora({ text: `Lade Vision-Model '${modelId}'...`, color: "cyan" }).start();
          try { await pullVisionModel(modelId, (s) => { spinner.text = s; }); spinner.succeed(`Vision-Model '${modelId}' installiert!`); }
          catch (err) { spinner.fail(`Fehler: ${err instanceof Error ? err.message : err}`); }
          return;
        }
        // Analyze image
        const vp = arg.match(/^(\S+)\s*(.*)?$/);
        if (!vp) return;
        const imgPath = resolve(cwd, vp[1]);
        const visionPrompt = vp[2] || "Beschreibe dieses Bild detailliert.";

        if (!existsSync(imgPath)) { console.log(chalk.hex(t().error)(`\n  Datei nicht gefunden: ${imgPath}\n`)); return; }
        if (!isImageFile(imgPath)) { console.log(chalk.hex(t().error)(`\n  Kein Bildformat: ${basename(imgPath)}\n`)); return; }
        if (!isOllamaRunning()) { console.log(chalk.hex(t().error)("\n  Ollama laeuft nicht! Starte: ollama serve\n")); return; }

        const vModel = DEFAULT_VISION_MODEL;
        if (!(await isVisionModelInstalled(vModel))) {
          const ps = ora({ text: `Lade Vision-Model '${vModel}'...`, color: "cyan" }).start();
          try { await pullVisionModel(vModel, (s) => { ps.text = s; }); ps.succeed(`Vision-Model '${vModel}' installiert!`); }
          catch (err) { ps.fail(`Fehler: ${err instanceof Error ? err.message : err}`); return; }
        }
        console.log(chalk.hex(t().info)(`\n  Analysiere ${basename(imgPath)} mit ${vModel}...\n`));
        try {
          process.stdout.write("  ");
          for await (const token of analyzeImage(imgPath, visionPrompt, vModel)) { process.stdout.write(token); }
          console.log("\n");
        } catch (err) { console.log(chalk.hex(t().error)(`\n  Fehler: ${err instanceof Error ? err.message : err}\n`)); }
      })();

    // ── Imagine (Image Generation) ──
    case "/imagine":
      if (arg === "models") {
        console.log(chalk.hex(t().info)("\n  Image-Gen Modelle (lokal, Stable Diffusion):\n"));
        const mem = getAvailableMemoryGB();
        for (const m of IMAGE_MODELS) {
          const rec = m.id === "sdxl-turbo" ? chalk.hex(t().success)(" (empfohlen)") : "";
          console.log(`  ${chalk.white(m.id.padEnd(12))} ${chalk.gray(m.size.padEnd(6))} ${chalk.hex(t().dim)(m.description)}${rec}`);
        }
        console.log(chalk.gray(`\n  RAM: ${mem}GB — ${mem >= 16 ? "SDXL empfohlen" : "SD 1.5 empfohlen fuer <16GB RAM"}\n`));
        return true;
      }
      if (!arg) {
        console.log(chalk.hex(t().info)("\n  Nutzung: /imagine <prompt>"));
        console.log(chalk.gray("  Beispiel: /imagine A futuristic city at sunset, cyberpunk style"));
        console.log(chalk.gray("  /imagine setup   — Umgebung einrichten (einmalig)"));
        console.log(chalk.gray("  /imagine models  — Verfuegbare Modelle\n"));
        return true;
      }
      return (async () => {
        if (arg === "setup") {
          if (await isSetupComplete()) { console.log(chalk.hex(t().success)("\n  Image Generation bereits eingerichtet.\n")); return; }
          if (!(await hasPython())) { console.log(chalk.hex(t().error)("\n  Python 3 nicht gefunden! Installiere: brew install python3\n")); return; }
          const sp = ora({ text: "Richte Image Generation ein...", color: "cyan" }).start();
          try { await setupImageGen((s) => { sp.text = s; }); sp.succeed("Image Generation eingerichtet!"); console.log(chalk.gray("  Nutze: /imagine <prompt>\n")); }
          catch (err) { sp.fail(`Setup fehlgeschlagen: ${err instanceof Error ? err.message : err}`); }
          return;
        }
        if (arg === "cleanup") { await cleanupImageGen(); console.log(chalk.hex(t().success)("\n  Image-Gen Umgebung entfernt.\n")); return; }
        // Auto-setup on first use
        if (!(await isSetupComplete())) {
          if (!(await hasPython())) { console.log(chalk.hex(t().error)("\n  Python 3 nicht gefunden! Installiere: brew install python3\n")); return; }
          console.log(chalk.hex(t().info)("\n  Erste Nutzung — richte Image Generation ein...\n"));
          const ss = ora({ text: "Installiere PyTorch + Diffusers...", color: "cyan" }).start();
          try { await setupImageGen((s) => { ss.text = s; }); ss.succeed("Setup fertig!"); }
          catch (err) { ss.fail(`Setup fehlgeschlagen: ${err instanceof Error ? err.message : err}`); return; }
        }
        const gs = ora({ text: `Generiere Bild: "${arg.slice(0, 60)}${arg.length > 60 ? "..." : ""}"`, color: "magenta" }).start();
        try {
          const result = await generateImage(arg);
          gs.succeed("Bild generiert!");
          console.log(chalk.hex(t().info)(`  Pfad:       ${result.path}`));
          console.log(chalk.gray(`  Model:      ${result.model}`));
          console.log(chalk.gray(`  Aufloesung: ${result.resolution}`));
          console.log(chalk.gray(`  Steps:      ${result.steps}`));
          console.log(chalk.gray(`  Seed:       ${result.seed}`));
          console.log(chalk.gray(`  Dauer:      ${result.duration}s`));
          try { execSync(`open "${result.path}"`, { stdio: "ignore" }); } catch {}
          console.log();
        } catch (err) { gs.fail(`Fehler: ${err instanceof Error ? err.message : err}`); }
      })();

    // ── Serve (API Server) ──
    case "/serve": {
      const srvPort = arg ? parseInt(arg, 10) : DEFAULT_PORT;
      if (isNaN(srvPort) || srvPort < 1 || srvPort > 65535) {
        console.log(chalk.hex(t().error)("\n  Ungueltiger Port. Nutze: /serve <1-65535>\n"));
        return true;
      }
      return (async () => {
        const sp = ora({ text: `Starte Morningstar API Server auf Port ${srvPort}...`, color: "cyan" }).start();
        try {
          const server = await startServer({ port: srvPort, host: "0.0.0.0", cliConfig: config, corsEnabled: true });
          sp.succeed(`Server laeuft: ${server.url}`);
          console.log(chalk.gray("  Stoppen: Ctrl+C\n"));
        } catch (err) { sp.fail(`Server-Fehler: ${err instanceof Error ? err.message : err}`); }
      })();
    }

    // ── Quit ──
    case "/quit":
    case "/exit":
    case "/q":
      console.log(chalk.hex(t().star)("\n  " + STAR() + " Bis bald!\n"));
      process.exit(0);

    default:
      // Agent management: /agent:edit, /agent:delete, /agent:show, /agent:export
      if (cmd === "/agent:edit") {
        const targetId = parts[1];
        if (!targetId) {
          const custom = loadCustomAgents();
          const ids = Object.keys(custom);
          if (ids.length === 0) console.log(chalk.gray("\n  Keine Custom Agents vorhanden. Erstelle einen mit /agent:create\n"));
          else { console.log(chalk.hex(t().info)("\n  Nutzung: /agent:edit <id>")); console.log(chalk.gray("  Custom Agents: " + ids.join(", ") + "\n")); }
          return true;
        }
        return agentEditWizard(targetId);
      }
      if (cmd === "/agent:delete") {
        const targetId = parts[1];
        if (!targetId) {
          const custom = loadCustomAgents();
          const ids = Object.keys(custom);
          if (ids.length === 0) console.log(chalk.gray("\n  Keine Custom Agents. Nichts zu loeschen.\n"));
          else { console.log(chalk.hex(t().info)("\n  Nutzung: /agent:delete <id>")); console.log(chalk.gray("  Custom Agents: " + ids.join(", ") + "\n")); }
          return true;
        }
        return agentDeleteConfirm(targetId);
      }
      if (cmd === "/agent:show") {
        const targetId = parts[1];
        if (!targetId) { console.log(chalk.hex(t().info)("\n  Nutzung: /agent:show <id>")); console.log(chalk.gray("  Verfuegbar: " + Object.keys(getAllAgents()).join(", ") + "\n")); return true; }
        agentShow(targetId);
        return true;
      }
      if (cmd === "/agent:export") {
        const targetId = parts[1];
        if (!targetId) { console.log(chalk.hex(t().info)("\n  Nutzung: /agent:export <id>")); console.log(chalk.gray("  Verfuegbar: " + Object.keys(getAllAgents()).join(", ") + "\n")); return true; }
        agentExport(targetId);
        return true;
      }

      // Agent activation
      if (cmd.startsWith("/agent:")) {
        const agentId = cmd.slice(7);
        if (agentId === "off" || agentId === "none") {
          if (!activeAgent) { console.log(chalk.gray("\n  Kein Agent aktiv. Nichts zu deaktivieren.\n")); return true; }
          activeAgent = null;
          messages[0] = { role: "system", content: getFullSystemPrompt() };
          console.log(chalk.hex(t().success)("\n  Agent deaktiviert. Standard-Modus.\n"));
          return true;
        }
        const allAgents = getAllAgents();
        if (allAgents[agentId]) {
          activeAgent = agentId;
          messages[0] = { role: "system", content: getAgentPrompt(agentId, getFullSystemPrompt(), allAgents) };
          const agent = allAgents[agentId];
          console.log(chalk.hex(agent.color)(`\n  ${STAR()} ${agent.name} aktiviert`));
          console.log(chalk.gray(`  ${agent.description}\n`));
          return true;
        }
        console.log(chalk.hex(t().error)(`\n  Unbekannter Agent: ${agentId}`));
        console.log(chalk.gray("  Verfuegbar: " + Object.keys(allAgents).join(", ")));
        console.log(chalk.gray("  /agent:create zum Erstellen\n"));
        return true;
      }
      return false;
  }
}

// ─── Stream AI ───────────────────────────────────────────
async function streamAI(msgs: Message[], cfg: CLIConfig, signal: AbortSignal): Promise<string> {
  let full = "";
  let firstContentToken = true;
  let firstReasoningToken = true;
  let isInReasoning = false;
  let reasoningLines = 0;
  let reasoningColPos = 0;           // current column position in reasoning line
  const MAX_PLAN_LINES = 20;        // compact — show max 20 lines
  const MAX_LINE_WIDTH = 68;        // wrap long lines
  const planStart = Date.now();
  const spinner = ora({ text: chalk.gray("Denkt nach..."), spinner: "dots", stream: process.stderr }).start();

  // Helper: start a new plan line
  function planNewLine() {
    reasoningLines++;
    reasoningColPos = 0;
    if (reasoningLines <= MAX_PLAN_LINES) {
      process.stdout.write("\n" + chalk.hex(t().dim)("  │ "));
    }
  }

  // Helper: write a single char inside the plan box
  function planChar(ch: string) {
    if (reasoningLines > MAX_PLAN_LINES) return;
    if (reasoningColPos >= MAX_LINE_WIDTH) {
      planNewLine(); // auto-wrap
    }
    process.stdout.write(chalk.hex(t().dim)(ch));
    reasoningColPos++;
  }

  // Helper: close the plan box
  function closePlanBox() {
    if (!isInReasoning) return;
    const elapsed = ((Date.now() - planStart) / 1000).toFixed(1);
    if (reasoningLines > MAX_PLAN_LINES) {
      process.stdout.write("\n" + chalk.hex(t().dim)(`  │  ... (+${reasoningLines - MAX_PLAN_LINES} Zeilen)`));
    }
    process.stdout.write("\n" + chalk.hex(t().dim)("  └─── ") + chalk.hex(t().dim)(`${elapsed}s`) + chalk.hex(t().dim)(" ───────────────────────────────────────") + "\n");
    isInReasoning = false;
  }

  try {
    for await (const token of streamChat(msgs, cfg, signal)) {
      if (signal.aborted) break;

      if (token.type === "reasoning") {
        // ── Plan/Thinking Phase ──
        if (firstReasoningToken) {
          spinner.stop();
          process.stdout.write("\n" + chalk.hex(t().dim)("  ┌─ ") + chalk.hex(t().accent).bold("Plan") + chalk.hex(t().dim)(" ──────────────────────────────────────"));
          process.stdout.write("\n" + chalk.hex(t().dim)("  │ "));
          firstReasoningToken = false;
          isInReasoning = true;
          reasoningLines = 1;
          reasoningColPos = 0;
        }
        // Stream reasoning text, char by char with word-wrap
        for (const ch of token.text) {
          if (ch === "\n") {
            planNewLine();
          } else {
            planChar(ch);
          }
        }
      } else {
        // ── Content Phase ──
        closePlanBox();
        if (firstContentToken) {
          if (firstReasoningToken) spinner.stop(); // No reasoning happened
          process.stdout.write("\n  " + chalk.hex(t().star)(STAR() + " "));
          firstContentToken = false;
        }
        process.stdout.write(token.text);
        full += token.text;
      }
    }
  } catch (err) {
    spinner.stop();
    if (signal.aborted) { console.log(chalk.hex(t().warning)("\n\n  Abgebrochen.\n")); return full; }
    throw err;
  }

  // Close plan box if reasoning ended without content
  closePlanBox();
  if (firstContentToken && firstReasoningToken) spinner.stop();
  if (full) { process.stdout.write("\x1b[0m\n\n"); }
  return full;
}

// ─── Main Chat Loop ──────────────────────────────────────
async function processInput(input: string) {
  if (!input.trim()) return;
  if (input.startsWith("/")) {
    const result = handleSlashCommand(input);
    if (result instanceof Promise) { await result; return; }
    if (result) return;
  }

  if (isProcessing) {
    // Queue the input for later processing instead of blocking
    inputQueue.push(input);
    console.log(chalk.hex(t().dim)(`\n  Eingabe vorgemerkt (${inputQueue.length} in Warteschlange)`));
    return;
  }

  isProcessing = true;
  currentAbort = new AbortController();
  const signal = currentAbort.signal;

  // Parse @-mentions
  const { cleanInput: mentionClean, mentions } = parseMentions(input, cwd);
  const mentionContext = formatMentionContext(mentions);
  if (mentions.length > 0) {
    console.log(chalk.hex(t().dim)(`\n  ${mentions.length} @-Mention(s) aufgeloest`));
  }

  // If plan mode, prefix the user message
  let userContent = planMode
    ? `[PLAN-MODUS] Erstelle zuerst einen detaillierten Plan bevor du handelst. Erklaere was du tun wuerdest und warte auf Bestaetigung.\n\n${mentionClean}`
    : mentionClean;
  if (mentionContext) userContent = mentionContext + "\n\n" + userContent;

  messages.push({ role: "user", content: userContent });
  totalTokensEstimate += input.length / 3;

  try {
    const fullResponse = await streamAI(messages, config, signal);
    if (signal.aborted || !fullResponse) { isProcessing = false; currentAbort = null; return; }
    totalTokensEstimate += fullResponse.length / 3;
    trackUsage(config.model, userContent, fullResponse);

    if (!chatOnly) {
      let toolResults: Awaited<ReturnType<typeof executeToolCalls>> | null = null;
      try { toolResults = await executeToolCalls(fullResponse, cwd); } catch (toolErr) { console.error(chalk.hex(t().error)(`\n  Tool-Fehler: ${(toolErr as Error).message}\n`)); }

      if (toolResults && toolResults.results.length > 0) {
        for (const r of toolResults.results) printToolResult(r.tool, r.result, r.success, r.diff);
        const toolFeedback = toolResults.results.map((r) => `[Tool: ${r.tool}] ${r.success ? "Erfolg" : "Fehler"}: ${r.result}`).join("\n\n");
        messages.push({ role: "assistant", content: fullResponse });
        messages.push({ role: "user", content: `Tool-Ergebnisse:\n${toolFeedback}\n\nFahre fort basierend auf den Ergebnissen.` });

        let depth = 0;
        let currentResponse = "";
        try { currentResponse = await streamAI(messages, config, signal); } catch (err) { if (!signal.aborted) console.error(chalk.hex(t().error)(`\n  Follow-up Fehler: ${(err as Error).message}\n`)); }

        while (depth < 5 && currentResponse && !signal.aborted) {
          let nested: Awaited<ReturnType<typeof executeToolCalls>> | null = null;
          try { nested = await executeToolCalls(currentResponse, cwd); } catch { break; }
          if (!nested || nested.results.length === 0) break;
          for (const r of nested.results) printToolResult(r.tool, r.result, r.success, r.diff);
          const nestedFeedback = nested.results.map((r) => `[Tool: ${r.tool}] ${r.success ? "Erfolg" : "Fehler"}: ${r.result}`).join("\n\n");
          messages.push({ role: "assistant", content: currentResponse });
          messages.push({ role: "user", content: `Tool-Ergebnisse:\n${nestedFeedback}\n\nFahre fort.` });
          try { currentResponse = await streamAI(messages, config, signal); } catch (err) { if (!signal.aborted) console.error(chalk.hex(t().error)(`\n  Runde ${depth + 1} Fehler: ${(err as Error).message}\n`)); break; }
          depth++;
        }
        if (currentResponse) messages.push({ role: "assistant", content: currentResponse });
      } else {
        messages.push({ role: "assistant", content: fullResponse });
      }
    } else {
      messages.push({ role: "assistant", content: fullResponse });
    }
  } catch (e) {
    if (!signal.aborted) console.error(chalk.hex(t().error)(`\n  Fehler: ${(e as Error).message}\n`));
  } finally {
    isProcessing = false;
    currentAbort = null;
    lastProcessingEndTime = Date.now();
    // Drain queued inputs, or restore prompt if queue empty
    if (inputQueue.length > 0) {
      drainInputQueue();
    } else {
      restorePrompt();
    }
  }
}

// ─── Input Queue Drain ───────────────────────────────────
function drainInputQueue() {
  if (inputQueue.length > 0 && !isProcessing) {
    const next = inputQueue.shift()!;
    console.log(chalk.hex(t().dim)(`\n  Verarbeite vorgemerkte Eingabe...`));
    processInput(next).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.hex(t().error)(`\n  Fehler: ${msg}\n`));
      restorePrompt();
    });
  }
}

// ─── Global Error Handlers ──────────────────────────────
process.on("uncaughtException", (err) => {
  console.error(chalk.hex(t().error)(`\n  Unerwarteter Fehler: ${err.message}`));
  console.error(chalk.gray("  Programm laeuft weiter. /help fuer Hilfe.\n"));
  isProcessing = false; currentAbort = null; inputQueue.length = 0;
  restorePrompt();
});
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(chalk.hex(t().error)(`\n  Async Fehler: ${msg}`));
  console.error(chalk.gray("  Programm laeuft weiter.\n"));
  isProcessing = false; currentAbort = null; inputQueue.length = 0;
  restorePrompt();
});

// ─── SIGINT Handler ──────────────────────────────────────
process.on("SIGINT", () => {
  if (isProcessing && currentAbort) {
    currentAbort.abort(); isProcessing = false; currentAbort = null; inputQueue.length = 0;
    console.log(chalk.hex(t().warning)("\n\n  Abgebrochen.\n"));
    restorePrompt();
  } else {
    console.log(chalk.hex(t().star)("\n\n  " + STAR() + " Bis bald!\n"));
    process.exit(0);
  }
});

// ─── Start ───────────────────────────────────────────────
printBanner();

function getPrompt(): string {
  if (activeAgent) {
    const allAgents = getAllAgents();
    const agent = allAgents[activeAgent];
    if (agent) return chalk.hex(agent.color).bold(`[${agent.name}] > `);
  }
  if (planMode) return chalk.hex(t().warning).bold("[Plan] > ");
  return PROMPT();
}

// ─── Autocomplete ────────────────────────────────────────
import { emitKeypressEvents } from "node:readline";

interface SlashCmd { cmd: string; desc: string; }

function buildSlashCommands(): SlashCmd[] {
  const cmds: SlashCmd[] = [
    { cmd: "/help", desc: "Alle Befehle" },
    { cmd: "/features", desc: "Alle Features" },
    { cmd: "/clear", desc: "Konversation zuruecksetzen" },
    { cmd: "/compact", desc: "Komprimieren" },
    { cmd: "/stats", desc: "Session-Statistiken" },
    { cmd: "/plan", desc: "Plan-Modus an/aus" },
    { cmd: "/agents", desc: "Agenten anzeigen" },
    { cmd: "/agent:create", desc: "Neuen Agent erstellen" },
    { cmd: "/agent:list", desc: "Alle Agenten" },
    { cmd: "/agent:import", desc: "Agent importieren" },
    { cmd: "/agent:off", desc: "Agent deaktivieren" },
  ];

  const allAgents = getAllAgents();
  for (const [id, agent] of Object.entries(allAgents)) cmds.push({ cmd: `/agent:${id}`, desc: `${agent.name}` });

  const custom = loadCustomAgents();
  for (const [id, agent] of Object.entries(custom)) {
    cmds.push({ cmd: `/agent:edit ${id}`, desc: `${agent.name} bearbeiten` });
    cmds.push({ cmd: `/agent:delete ${id}`, desc: `${agent.name} loeschen` });
  }
  for (const [id, agent] of Object.entries(allAgents)) {
    cmds.push({ cmd: `/agent:show ${id}`, desc: `${agent.name} Details` });
    cmds.push({ cmd: `/agent:export ${id}`, desc: `${agent.name} Export` });
  }

  cmds.push(
    { cmd: "/memory add", desc: "Notiz speichern" },
    { cmd: "/memory list", desc: "Notizen anzeigen" },
    { cmd: "/memory search", desc: "Notizen suchen" },
    { cmd: "/memory remove", desc: "Notiz loeschen" },
    { cmd: "/memory clear", desc: "Alle Notizen loeschen" },
    { cmd: "/todo add", desc: "Aufgabe hinzufuegen" },
    { cmd: "/todo list", desc: "Aufgaben anzeigen" },
    { cmd: "/todo done", desc: "Aufgabe erledigt" },
    { cmd: "/todo remove", desc: "Aufgabe loeschen" },
    { cmd: "/todo clear", desc: "Erledigte loeschen" },
    { cmd: "/diff", desc: "Git diff" },
    { cmd: "/diff staged", desc: "Staged changes" },
    { cmd: "/commit", desc: "Smart Commit" },
    { cmd: "/status", desc: "Git status" },
    { cmd: "/log", desc: "Git log" },
    { cmd: "/branch", desc: "Git branches" },
    { cmd: "/init", desc: "MORNINGSTAR.md erstellen" },
    { cmd: "/undo", desc: "Letzte Aenderung rueckgaengig" },
    { cmd: "/undo list", desc: "Undo-Stack anzeigen" },
    { cmd: "/search", desc: "Im Projekt suchen" },
    { cmd: "/history save", desc: "Session speichern" },
    { cmd: "/history list", desc: "Sessions anzeigen" },
    { cmd: "/history load", desc: "Session laden" },
    { cmd: "/history delete", desc: "Session loeschen" },
    { cmd: "/theme", desc: "Theme wechseln" },
    ...Object.keys(THEMES).map(id => ({ cmd: `/theme ${id}`, desc: `Theme: ${THEMES[id].name}` })),
    { cmd: "/config", desc: "Konfiguration" },
    { cmd: "/config set", desc: "Einstellung aendern" },
    { cmd: "/doctor", desc: "Setup diagnostizieren" },
    { cmd: "/model", desc: "Model wechseln" },
    { cmd: "/provider", desc: "Provider anzeigen/wechseln" },
    { cmd: "/provider deepseek", desc: "DeepSeek" },
    { cmd: "/provider openai", desc: "OpenAI" },
    { cmd: "/provider anthropic", desc: "Anthropic" },
    { cmd: "/provider google", desc: "Google Gemini" },
    { cmd: "/provider ollama", desc: "Ollama (lokal)" },
    { cmd: "/provider groq", desc: "Groq" },
    { cmd: "/provider openrouter", desc: "OpenRouter" },
    { cmd: "/providers", desc: "Alle Provider anzeigen" },
    { cmd: "/permissions", desc: "Permission-Modus" },
    { cmd: "/permissions auto", desc: "Alle Tools erlaubt" },
    { cmd: "/permissions ask", desc: "Bei Schreibzugriff fragen" },
    { cmd: "/permissions strict", desc: "Immer fragen" },
    { cmd: "/onboard", desc: "Projekt-Onboarding" },
    { cmd: "/score", desc: "Projekt-Score" },
    { cmd: "/roast", desc: "Code Roast" },
    { cmd: "/map", desc: "Codebase Map" },
    // Dynamic: all models from all providers
    ...listProviders().flatMap(p =>
      p.models.filter(m => !m.startsWith("(")).map(m => ({
        cmd: `/model ${m}`,
        desc: `${getModelDisplayName(m)} [${p.name}]`,
      }))
    ),
    // Dynamic: installed Ollama models
    ...(() => { try { return getOllamaModels().map(m => ({ cmd: `/model ${m.name}`, desc: `${m.name} (${m.size}) [ollama]` })); } catch { return []; } })(),
    // Popular Ollama models not yet installed
    ...POPULAR_OLLAMA_MODELS.map(m => ({ cmd: `/model ${m.name}`, desc: `${m.desc} [ollama]` })),
    { cmd: "/vision", desc: "Bild analysieren (Ollama)" },
    { cmd: "/vision models", desc: "Vision-Modelle anzeigen" },
    { cmd: "/vision setup", desc: "Vision-Model installieren" },
    ...VISION_MODELS.map(m => ({ cmd: `/vision setup ${m.id}`, desc: `${m.name} installieren (${m.size})` })),
    { cmd: "/imagine", desc: "Bild generieren (Stable Diffusion)" },
    { cmd: "/imagine setup", desc: "Image-Gen einrichten" },
    { cmd: "/imagine models", desc: "Image-Gen Modelle" },
    { cmd: "/imagine cleanup", desc: "Image-Gen entfernen" },
    { cmd: "/serve", desc: "API Server starten" },
    { cmd: "/serve 3000", desc: "Server auf Port 3000" },
    { cmd: "/serve 8080", desc: "Server auf Port 8080" },
    { cmd: "/context", desc: "Projekt-Kontext" },
    { cmd: "/cost", desc: "Kosten-Tracking" },
    { cmd: "/quit", desc: "Beenden" },
  );
  // Deduplicate by cmd (first occurrence wins)
  const seen = new Set<string>();
  return cmds.filter(c => { if (seen.has(c.cmd)) return false; seen.add(c.cmd); return true; });
}

let SLASH_COMMANDS: SlashCmd[] = buildSlashCommands();
function refreshSlashCommands(): void { SLASH_COMMANDS = buildSlashCommands(); }

function completer(line: string): [string[], string] {
  if (line.startsWith("/")) {
    const hits = SLASH_COMMANDS.filter(c => c.cmd.startsWith(line)).map(c => c.cmd);
    return [hits.length ? hits : SLASH_COMMANDS.map(c => c.cmd), line];
  }
  return [[], line];
}

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT(), terminal: process.stdin.isTTY !== false, completer });

// ─── Live Autocomplete Suggestions ───────────────────────
let suggestionsShown = 0;
let selectedIdx = 0;

function clearSuggestions() {
  if (suggestionsShown <= 0) return;
  for (let i = 0; i < suggestionsShown; i++) process.stdout.write("\x1b[B");
  for (let i = 0; i < suggestionsShown; i++) { process.stdout.write("\x1b[A"); process.stdout.write("\x1b[2K"); }
  suggestionsShown = 0;
}

function renderSuggestions(line: string) {
  clearSuggestions();
  if (!line.startsWith("/") || isProcessing) return;
  const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(line));
  if (matches.length === 0 || (matches.length === 1 && matches[0].cmd === line)) return;
  selectedIdx = Math.max(0, Math.min(selectedIdx, matches.length - 1));
  process.stdout.write("\x1b[s");
  const maxShow = Math.min(matches.length, 8);
  for (let i = 0; i < maxShow; i++) {
    const m = matches[i];
    process.stdout.write("\n");
    if (i === selectedIdx) process.stdout.write(chalk.bgHex("#3b3b3b").hex("#22d3ee").bold(`  ${m.cmd}`) + chalk.bgHex("#3b3b3b").hex("#6b7280")(` ${m.desc}`) + "\x1b[K");
    else process.stdout.write(chalk.hex("#6b7280")(`  ${m.cmd}`) + chalk.hex("#4b5563")(` ${m.desc}`) + "\x1b[K");
  }
  if (matches.length > maxShow) { process.stdout.write("\n" + chalk.hex("#4b5563")(`  ... +${matches.length - maxShow} weitere`) + "\x1b[K"); suggestionsShown = maxShow + 1; }
  else suggestionsShown = maxShow;
  process.stdout.write("\x1b[u");
}

if (process.stdin.isTTY) {
  emitKeypressEvents(process.stdin, rl);
  process.stdin.on("keypress", (_ch: string | undefined, key: { name?: string; ctrl?: boolean; sequence?: string }) => {
    if (isProcessing) return;
    const line = (rl as unknown as { line: string }).line || "";
    if (key?.name === "down" && suggestionsShown > 0) { const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(line)); selectedIdx = Math.min(selectedIdx + 1, Math.min(matches.length, 8) - 1); renderSuggestions(line); return; }
    if (key?.name === "up" && suggestionsShown > 0) { selectedIdx = Math.max(selectedIdx - 1, 0); renderSuggestions(line); return; }
    if (key?.name === "tab" && suggestionsShown > 0 && line.startsWith("/")) {
      const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(line));
      if (matches.length > 0 && matches[selectedIdx]) {
        clearSuggestions();
        const selected = matches[selectedIdx].cmd;
        (rl as unknown as { line: string; cursor: number }).line = selected;
        (rl as unknown as { line: string; cursor: number }).cursor = selected.length;
        process.stdout.write("\x1b[2K\r" + getPrompt() + selected);
        selectedIdx = 0; return;
      }
    }
    if (key?.name === "return") { clearSuggestions(); selectedIdx = 0; return; }
    if (key?.name === "escape") { clearSuggestions(); selectedIdx = 0; return; }
    selectedIdx = 0;
    setImmediate(() => {
      const currentLine = (rl as unknown as { line: string }).line || "";
      if (currentLine.startsWith("/")) renderSuggestions(currentLine);
      else clearSuggestions();
    });
  });
}

rl.prompt();

let multilineBuffer = "";
let isMultiline = false;

rl.on("line", async (line) => {
  clearSuggestions(); selectedIdx = 0;
  if (line.endsWith("\\\\") || line.endsWith("\\")) { multilineBuffer += line.slice(0, -1) + "\n"; isMultiline = true; process.stdout.write(chalk.gray("... ")); return; }
  const input = isMultiline ? multilineBuffer + line : line;
  multilineBuffer = ""; isMultiline = false;
  try { await processInput(input); } catch (err) { const msg = err instanceof Error ? err.message : String(err); console.error(chalk.hex(t().error)(`\n  Fehler: ${msg}\n`)); restorePrompt(); }
});

rl.on("close", () => { clearSuggestions(); console.log(chalk.hex(t().star)("\n  " + STAR() + " Bis bald!\n")); process.exit(0); });

// ─── Watchdog: auto-restore prompt if readline gets stuck ──
setInterval(() => {
  if (!isProcessing && lastProcessingEndTime > 0 && Date.now() - lastProcessingEndTime > 3000) {
    lastProcessingEndTime = 0;
    try { restorePrompt(); } catch {}
  }
}, 2000);
