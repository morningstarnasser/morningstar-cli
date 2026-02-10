#!/usr/bin/env node

import { createInterface } from "node:readline";
import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import chalk from "chalk";
import ora from "ora";
import { program } from "commander";
import { streamChat } from "./ai.js";
import { executeToolCalls } from "./tools.js";
import { detectProject, buildSystemPrompt } from "./context.js";
import { AGENTS, getAgentPrompt, listAgents } from "./agents.js";
import type { Message, CLIConfig } from "./types.js";

// ─── Config ──────────────────────────────────────────────
const VERSION = "1.0.0";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// Load saved config
function loadSavedConfig(): { apiKey?: string; model?: string } {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveConfig(data: { apiKey?: string; model?: string }) {
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

const DEFAULT_CONFIG: CLIConfig = {
  apiKey: "",
  model: "deepseek-reasoner",  // DeepSeek R1
  baseUrl: "https://api.deepseek.com/v1",
  maxTokens: 8192,
  temperature: 0.6,
};

// ─── CLI Setup ───────────────────────────────────────────
program
  .name("morningstar")
  .description("Morningstar AI - Terminal Coding Assistant powered by DeepSeek R1")
  .version(VERSION)
  .option("-k, --api-key <key>", "DeepSeek API Key")
  .option("-m, --model <model>", "Model ID (default: deepseek-reasoner)")
  .option("-d, --dir <path>", "Working directory")
  .option("--chat", "Chat-only mode (no tools)")
  .parse();

const opts = program.opts();
const cwd = resolve(opts.dir || process.cwd());
const chatOnly = opts.chat || false;

// Load .env files
loadEnvFile(cwd);

const config: CLIConfig = {
  ...DEFAULT_CONFIG,
  apiKey: opts.apiKey || process.env.DEEPSEEK_API_KEY || saved.apiKey || "sk-595c100043be498387b22a0cd648dc0f",
  model: opts.model || saved.model || DEFAULT_CONFIG.model,
};

// ─── Interactive API Key Setup ───────────────────────────
async function ensureApiKey(): Promise<void> {
  // If we have a key (from env, saved config, or hardcoded default), skip
  if (config.apiKey) return;

  console.log(chalk.yellow("\n  Kein DeepSeek API Key gefunden!\n"));
  console.log(chalk.gray("  Du brauchst einen API Key von https://platform.deepseek.com"));
  console.log(chalk.gray("  Der Key wird in ~/.morningstar/config.json gespeichert.\n"));

  const setupRl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    setupRl.question(chalk.cyan("  API Key eingeben: "), (answer) => {
      setupRl.close();
      const key = answer.trim();
      if (key) {
        config.apiKey = key;
        saveConfig({ apiKey: key });
        console.log(chalk.green("\n  API Key gespeichert!\n"));
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
const systemPrompt = chatOnly
  ? "Du bist Morningstar AI, ein hilfreicher Coding-Assistant. Antworte direkt und effizient."
  : buildSystemPrompt(ctx);

// ─── State ───────────────────────────────────────────────
const messages: Message[] = [{ role: "system", content: systemPrompt }];
let totalTokensEstimate = 0;
let activeAgent: string | null = null;
let isProcessing = false;
let currentAbort: AbortController | null = null;

// ─── UI Helpers ──────────────────────────────────────────
const STAR = chalk.magenta("*");
const PROMPT = chalk.cyan.bold("> ");
const DIVIDER = chalk.gray("─".repeat(60));

function printBanner() {
  const m = chalk.hex("#d946ef");       // magenta/purple
  const g = chalk.hex("#a855f7");       // violet glow
  const w = chalk.hex("#f0abfc");       // soft pink
  const y = chalk.hex("#fbbf24");       // gold accent
  const c = chalk.hex("#22d3ee");       // cyan
  const d = chalk.hex("#6b7280");       // dim gray
  const b = chalk.bold;

  // Top banner box with star
  const BW = 58; // inner box width
  const pad = (raw: string) => " ".repeat(Math.max(0, BW - raw.length));
  const row = (rawText: string, coloredText: string) =>
    d("  ║") + coloredText + pad(rawText) + d("║");
  const empty = d("  ║") + " ".repeat(BW) + d("║");

  // Center helper: centers raw text within BW, returns colored version
  const center = (rawText: string, coloredText: string) => {
    const left = Math.floor((BW - rawText.length) / 2);
    const right = BW - rawText.length - left;
    return d("  ║") + " ".repeat(left) + coloredText + " ".repeat(right) + d("║");
  };

  console.log();
  console.log(d("  ╔" + "═".repeat(BW) + "╗"));
  console.log(empty);
  console.log(center(". .  ★  . .",                           g(". .  ") + y(b("★")) + g("  . .")));
  console.log(center(".  ./ . \\.  .",                         g(".  .") + m(b("/")) + g(" . ") + m(b("\\")) + g(".  .")));
  console.log(center(".  /  . | .  \\  .",                     g(".  ") + m(b("/")) + g("  . ") + w(b("|")) + g(" .  ") + m(b("\\")) + g("  .")));
  console.log(center("── * ─────+───── * ──",                 g("── ") + m(b("*")) + g(" ─────") + y(b("+")) + g("───── ") + m(b("*")) + g(" ──")));
  console.log(center(".  \\  . | .  /  .",                     g(".  ") + m(b("\\")) + g("  . ") + w(b("|")) + g(" .  ") + m(b("/")) + g("  .")));
  console.log(center(".  .\\ . /.  .",                         g(".  .") + m(b("\\")) + g(" . ") + m(b("/")) + g(".  .")));
  console.log(center(". .  ★  . .",                           g(". .  ") + y(b("★")) + g("  . .")));
  console.log(empty);
  console.log(center("M O R N I N G S T A R",                m(b("M O R N I N G S T A R"))));
  console.log(d("  ║") + "   " + d("━".repeat(BW - 6)) + "   " + d("║"));
  console.log(center("Terminal AI Coding Assistant",          w("Terminal AI Coding Assistant")));
  console.log(center("Powered by Mr.Morningstar", d("Powered by") + " " + y(b("Mr.Morningstar"))));
  console.log(empty);
  console.log(d("  ╚" + "═".repeat(BW) + "╝"));
  console.log();

  // Info block (left-border style, no right alignment issues)
  const modelRaw = config.model === "deepseek-reasoner" ? "deepseek-reasoner (R1 Thinking)" : config.model;
  const modelDisplay = config.model === "deepseek-reasoner" ? c("deepseek-reasoner") + d(" (R1 Thinking)") : c(config.model);
  const langInfo = ctx.language
    ? ctx.language + (ctx.framework ? " / " + ctx.framework : "")
    : "unbekannt";
  const langDisplay = ctx.language
    ? chalk.white(ctx.language) + (ctx.framework ? d(" / ") + y(ctx.framework) : "")
    : d("unbekannt");
  const cwdShort = cwd.length > 42 ? "..." + cwd.slice(-39) : cwd;

  // Calculate max width for box
  const infoLines = [
    { raw: `Model    ${modelRaw}`, colored: m(" ★ ") + d("Model    ") + modelDisplay },
    { raw: `Projekt  ${ctx.projectName} (${langInfo})`, colored: m(" ★ ") + d("Projekt  ") + chalk.white.bold(ctx.projectName) + " " + d("(") + langDisplay + d(")") },
    ...(ctx.hasGit ? [{ raw: `Branch   ${ctx.gitBranch || "unknown"}`, colored: m(" ★ ") + d("Branch   ") + y(ctx.gitBranch || "unknown") }] : []),
    { raw: `CWD      ${cwdShort}`, colored: m(" ★ ") + d("CWD      ") + chalk.white(cwdShort) },
  ];
  const maxW = Math.max(...infoLines.map(l => l.raw.length + 4)) + 2; // +4 for " ★ ", +2 padding
  const boxW = Math.max(maxW, 50);

  console.log(d("  ┌" + "─".repeat(boxW) + "┐"));
  for (const line of infoLines) {
    const pad = boxW - line.raw.length - 4; // 4 = " ★ " visible width
    console.log(d("  │") + line.colored + " ".repeat(Math.max(1, pad)) + d("│"));
  }
  console.log(d("  └" + "─".repeat(boxW) + "┘"));
  console.log();

  // Tools & commands
  console.log(
    d("  Tools   ") +
    c("read") + d(" · ") + c("write") + d(" · ") + c("edit") + d(" · ") + c("bash") + d(" · ") +
    c("grep") + d(" · ") + c("glob") + d(" · ") + c("ls") + d(" · ") + c("git")
  );
  console.log(
    d("  Agents  ") +
    chalk.hex("#06b6d4")("code") + d(" · ") +
    chalk.hex("#ef4444")("debug") + d(" · ") +
    chalk.hex("#f59e0b")("review") + d(" · ") +
    chalk.hex("#10b981")("refactor") + d(" · ") +
    chalk.hex("#d946ef")("architect") + d(" · ") +
    chalk.hex("#3b82f6")("test")
  );
  console.log(
    d("  Hilfe   ") +
    w("/help") + d(" · ") + w("/features") + d(" · ") + w("/agents") + d(" · ") + w("/quit")
  );

  console.log();
  console.log(d("  ─────────────────────────────────────────────────────────"));
  console.log();
}

function printToolResult(tool: string, result: string, success: boolean) {
  const icon = success ? chalk.green("✓") : chalk.red("✗");
  const header = chalk.yellow(`[${tool}]`);
  console.log(`\n  ${icon} ${header}`);
  const lines = result.split("\n").slice(0, 30);
  for (const line of lines) {
    console.log(chalk.gray(`  ${line}`));
  }
  if (result.split("\n").length > 30) {
    console.log(chalk.gray(`  ...(${result.split("\n").length - 30} weitere Zeilen)`));
  }
  console.log();
}

function printHelp() {
  console.log(chalk.cyan("\n  Morningstar CLI - Befehle:\n"));
  console.log(chalk.white("  /help       ") + chalk.gray("Diese Hilfe anzeigen"));
  console.log(chalk.white("  /features   ") + chalk.gray("Alle Features anzeigen"));
  console.log(chalk.white("  /agents     ") + chalk.gray("Verfuegbare Agenten anzeigen"));
  console.log(chalk.white("  /agent:<id> ") + chalk.gray("Agent aktivieren (code, debug, review, refactor, architect, test)"));
  console.log(chalk.white("  /agent:off  ") + chalk.gray("Agent deaktivieren"));
  console.log(chalk.white("  /clear      ") + chalk.gray("Konversation zuruecksetzen"));
  console.log(chalk.white("  /model <id> ") + chalk.gray("Model wechseln (deepseek-reasoner, deepseek-chat)"));
  console.log(chalk.white("  /context    ") + chalk.gray("Projekt-Kontext anzeigen"));
  console.log(chalk.white("  /cost       ") + chalk.gray("Geschaetzte Token-Nutzung"));
  console.log(chalk.white("  /compact    ") + chalk.gray("Konversation komprimieren"));
  console.log(chalk.white("  /quit       ") + chalk.gray("Beenden\n"));
}

function printFeatures() {
  console.log(chalk.magenta.bold("\n  " + STAR + " Morningstar AI — Alle Features\n"));

  console.log(chalk.cyan.bold("  AI-Backend"));
  console.log(chalk.gray("  - DeepSeek R1 (Reasoning) — denkt Schritt fuer Schritt"));
  console.log(chalk.gray("  - DeepSeek Chat — schnelle Antworten"));
  console.log(chalk.gray("  - Streaming — Antworten erscheinen live Token fuer Token"));
  console.log(chalk.gray("  - Multi-Turn — KI fuehrt Tools aus und reagiert auf Ergebnisse (bis 5 Runden)"));
  console.log();

  console.log(chalk.cyan.bold("  Tools (automatisch verfuegbar)"));
  console.log(chalk.white("  read     ") + chalk.gray("Dateien lesen mit Zeilennummern"));
  console.log(chalk.white("  write    ") + chalk.gray("Dateien schreiben/erstellen (inkl. Ordner)"));
  console.log(chalk.white("  edit     ") + chalk.gray("Text in Dateien finden & ersetzen"));
  console.log(chalk.white("  delete   ") + chalk.gray("Dateien loeschen"));
  console.log(chalk.white("  bash     ") + chalk.gray("Shell-Befehle ausfuehren (30s Timeout)"));
  console.log(chalk.white("  grep     ") + chalk.gray("In Dateien nach Mustern suchen"));
  console.log(chalk.white("  glob     ") + chalk.gray("Dateien nach Pattern finden (z.B. **/*.ts)"));
  console.log(chalk.white("  ls       ") + chalk.gray("Verzeichnis auflisten mit Groessen"));
  console.log(chalk.white("  git      ") + chalk.gray("Git Status + letzte 5 Commits anzeigen"));
  console.log();

  console.log(chalk.cyan.bold("  Agenten (spezialisierte KI-Modi)"));
  console.log(chalk.hex("#06b6d4")("  /agent:code      ") + chalk.gray("Code schreiben, Features implementieren"));
  console.log(chalk.hex("#ef4444")("  /agent:debug     ") + chalk.gray("Bugs finden, Root Cause Analyse"));
  console.log(chalk.hex("#f59e0b")("  /agent:review    ") + chalk.gray("Code Review, Security, Performance"));
  console.log(chalk.hex("#10b981")("  /agent:refactor  ") + chalk.gray("Code-Refactoring, Cleanup"));
  console.log(chalk.hex("#d946ef")("  /agent:architect ") + chalk.gray("System Design, Architektur-Planung"));
  console.log(chalk.hex("#3b82f6")("  /agent:test      ") + chalk.gray("Tests schreiben, Coverage erhoehen"));
  console.log();

  console.log(chalk.cyan.bold("  Projekt-Erkennung (automatisch)"));
  console.log(chalk.gray("  - Sprache: TypeScript, JavaScript, Python, Go, Rust, Java"));
  console.log(chalk.gray("  - Framework: Next.js, React, Vue, Svelte, Express, Django, FastAPI, Flask"));
  console.log(chalk.gray("  - Git Branch wird erkannt"));
  console.log(chalk.gray("  - Dateistruktur wird dem AI-Kontext hinzugefuegt"));
  console.log();

  console.log(chalk.cyan.bold("  Beispiele"));
  console.log(chalk.gray("  > Analysiere dieses Projekt und finde Probleme"));
  console.log(chalk.gray("  > Schreibe eine REST API mit Authentication"));
  console.log(chalk.gray("  > Erklaere mir src/app/page.tsx"));
  console.log(chalk.gray("  > Finde alle TODO Kommentare im Projekt"));
  console.log(chalk.gray("  > /agent:debug Warum crasht die App beim Login?"));
  console.log(chalk.gray("  > /agent:code Fuege Dark Mode hinzu"));
  console.log();
}

// ─── Slash Commands ──────────────────────────────────────
function handleSlashCommand(input: string): boolean {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case "/help":
      printHelp();
      return true;
    case "/features":
      printFeatures();
      return true;
    case "/clear":
      messages.length = 1; // keep system prompt
      totalTokensEstimate = 0;
      console.log(chalk.green("\n  Konversation zurueckgesetzt.\n"));
      return true;
    case "/model": {
      const newModel = parts[1];
      if (newModel) {
        config.model = newModel;
        saveConfig({ model: newModel });
        console.log(chalk.green(`\n  Model gewechselt: ${newModel}\n`));
      } else {
        console.log(chalk.cyan(`\n  Aktuelles Model: ${config.model}`));
        console.log(chalk.gray("  Verfuegbar: deepseek-reasoner, deepseek-chat\n"));
      }
      return true;
    }
    case "/context":
      console.log(chalk.cyan("\n  Projekt-Kontext:"));
      console.log(chalk.gray(`  CWD: ${ctx.cwd}`));
      console.log(chalk.gray(`  Name: ${ctx.projectName}`));
      console.log(chalk.gray(`  Sprache: ${ctx.language || "unbekannt"}`));
      console.log(chalk.gray(`  Framework: ${ctx.framework || "keins"}`));
      console.log(chalk.gray(`  Git: ${ctx.hasGit ? ctx.gitBranch || "ja" : "nein"}`));
      console.log(chalk.gray(`  Dateien: ${ctx.files.length}\n`));
      return true;
    case "/cost":
      console.log(chalk.cyan(`\n  Messages: ${messages.length}`));
      console.log(chalk.gray(`  Geschaetzte Tokens: ~${totalTokensEstimate}\n`));
      return true;
    case "/compact": {
      if (messages.length <= 3) {
        console.log(chalk.gray("\n  Nichts zu komprimieren.\n"));
        return true;
      }
      const keep = messages.length > 6 ? messages.slice(-4) : messages.slice(-2);
      messages.length = 1;
      messages.push(...keep);
      console.log(chalk.green(`\n  Konversation komprimiert. ${messages.length} Messages behalten.\n`));
      return true;
    }
    case "/agents":
      console.log(chalk.cyan("\n  Verfuegbare Agenten:\n"));
      console.log(listAgents());
      if (activeAgent) console.log(chalk.yellow(`\n  Aktiv: ${AGENTS[activeAgent]?.name || activeAgent}`));
      console.log(chalk.gray("\n  Nutze /agent:name oder /agent:off zum Deaktivieren\n"));
      return true;
    case "/quit":
    case "/exit":
    case "/q":
      console.log(chalk.magenta("\n  " + STAR + " Bis bald!\n"));
      process.exit(0);
    default:
      // Agent activation: /agent:code, /agent:debug etc.
      if (cmd.startsWith("/agent:")) {
        const agentId = cmd.slice(7);
        if (agentId === "off" || agentId === "none") {
          activeAgent = null;
          messages[0] = { role: "system", content: systemPrompt };
          console.log(chalk.green("\n  Agent deaktiviert. Standard-Modus.\n"));
          return true;
        }
        if (AGENTS[agentId]) {
          activeAgent = agentId;
          const agentPrompt = getAgentPrompt(agentId, systemPrompt);
          messages[0] = { role: "system", content: agentPrompt };
          const agent = AGENTS[agentId];
          console.log(chalk.hex(agent.color === "cyan" ? "#06b6d4" : agent.color === "red" ? "#ef4444" : agent.color === "yellow" ? "#f59e0b" : agent.color === "green" ? "#10b981" : agent.color === "magenta" ? "#d946ef" : "#3b82f6")(`\n  ${STAR} ${agent.name} aktiviert`));
          console.log(chalk.gray(`  ${agent.description}\n`));
          return true;
        }
        console.log(chalk.red(`\n  Unbekannter Agent: ${agentId}`));
        console.log(chalk.gray("  Verfuegbar: " + Object.keys(AGENTS).join(", ") + "\n"));
        return true;
      }
      return false;
  }
}

// ─── Stream AI with abort support ────────────────────────
async function streamAI(msgs: Message[], cfg: CLIConfig, signal: AbortSignal): Promise<string> {
  let full = "";
  let firstToken = true;
  const spinner = ora({ text: chalk.gray("Denkt nach..."), spinner: "dots" }).start();

  try {
    for await (const token of streamChat(msgs, cfg, signal)) {
      if (signal.aborted) break;
      if (firstToken) {
        spinner.stop();
        process.stdout.write("\n  " + chalk.magenta(STAR + " "));
        firstToken = false;
      }
      process.stdout.write(token);
      full += token;
    }
  } catch (err) {
    spinner.stop();
    if (signal.aborted) {
      console.log(chalk.yellow("\n\n  Abgebrochen.\n"));
      return full;
    }
    throw err;
  }

  if (firstToken) spinner.stop();
  if (full) console.log("\n");
  return full;
}

// ─── Main Chat Loop ──────────────────────────────────────
async function processInput(input: string) {
  if (!input.trim()) return;
  if (input.startsWith("/") && handleSlashCommand(input)) return;

  if (isProcessing) {
    console.log(chalk.yellow("\n  Bitte warten, Anfrage wird noch verarbeitet...\n"));
    return;
  }

  isProcessing = true;
  currentAbort = new AbortController();
  const signal = currentAbort.signal;

  messages.push({ role: "user", content: input });
  totalTokensEstimate += input.length / 3;

  try {
    const fullResponse = await streamAI(messages, config, signal);
    if (signal.aborted || !fullResponse) {
      isProcessing = false;
      currentAbort = null;
      return;
    }

    totalTokensEstimate += fullResponse.length / 3;

    // Execute tool calls if not chat-only
    if (!chatOnly) {
      let toolResults: Awaited<ReturnType<typeof executeToolCalls>> | null = null;
      try {
        toolResults = await executeToolCalls(fullResponse, cwd);
      } catch (toolErr) {
        console.error(chalk.red(`\n  Tool-Fehler: ${(toolErr as Error).message}\n`));
      }

      if (toolResults && toolResults.results.length > 0) {
        for (const r of toolResults.results) {
          printToolResult(r.tool, r.result, r.success);
        }

        const toolFeedback = toolResults.results
          .map((r) => `[Tool: ${r.tool}] ${r.success ? "Erfolg" : "Fehler"}: ${r.result}`)
          .join("\n\n");

        messages.push({ role: "assistant", content: fullResponse });
        messages.push({ role: "user", content: `Tool-Ergebnisse:\n${toolFeedback}\n\nFahre fort basierend auf den Ergebnissen.` });

        // Follow-up rounds (up to 5)
        let depth = 0;
        let currentResponse = "";

        try {
          currentResponse = await streamAI(messages, config, signal);
        } catch (err) {
          if (!signal.aborted) console.error(chalk.red(`\n  Follow-up Fehler: ${(err as Error).message}\n`));
        }

        while (depth < 5 && currentResponse && !signal.aborted) {
          let nested: Awaited<ReturnType<typeof executeToolCalls>> | null = null;
          try {
            nested = await executeToolCalls(currentResponse, cwd);
          } catch { break; }
          if (!nested || nested.results.length === 0) break;

          for (const r of nested.results) {
            printToolResult(r.tool, r.result, r.success);
          }

          const nestedFeedback = nested.results
            .map((r) => `[Tool: ${r.tool}] ${r.success ? "Erfolg" : "Fehler"}: ${r.result}`)
            .join("\n\n");

          messages.push({ role: "assistant", content: currentResponse });
          messages.push({ role: "user", content: `Tool-Ergebnisse:\n${nestedFeedback}\n\nFahre fort.` });

          try {
            currentResponse = await streamAI(messages, config, signal);
          } catch (err) {
            if (!signal.aborted) console.error(chalk.red(`\n  Runde ${depth + 1} Fehler: ${(err as Error).message}\n`));
            break;
          }
          depth++;
        }

        if (currentResponse) {
          messages.push({ role: "assistant", content: currentResponse });
        }
      } else {
        messages.push({ role: "assistant", content: fullResponse });
      }
    } else {
      messages.push({ role: "assistant", content: fullResponse });
    }
  } catch (e) {
    if (!signal.aborted) {
      console.error(chalk.red(`\n  Fehler: ${(e as Error).message}\n`));
    }
  } finally {
    isProcessing = false;
    currentAbort = null;
  }
}

// ─── Global Error Handlers (prevent crashes) ────────────
process.on("uncaughtException", (err) => {
  console.error(chalk.red(`\n  Unerwarteter Fehler: ${err.message}`));
  console.error(chalk.gray("  Das Programm laeuft weiter. Tippe /help fuer Hilfe.\n"));
  isProcessing = false;
  currentAbort = null;
  try { rl.prompt(); } catch {}
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(chalk.red(`\n  Async Fehler: ${msg}`));
  console.error(chalk.gray("  Das Programm laeuft weiter.\n"));
  isProcessing = false;
  currentAbort = null;
  try { rl.prompt(); } catch {}
});

// ─── SIGINT Handler (Ctrl+C) ────────────────────────────
process.on("SIGINT", () => {
  if (isProcessing && currentAbort) {
    // Cancel current request
    currentAbort.abort();
    isProcessing = false;
    currentAbort = null;
    console.log(chalk.yellow("\n\n  Abgebrochen. Bereit fuer neue Eingabe.\n"));
    rl.prompt();
  } else {
    // Exit if not processing
    console.log(chalk.magenta("\n\n  " + STAR + " Bis bald!\n"));
    process.exit(0);
  }
});

// ─── Start ───────────────────────────────────────────────
printBanner();

function getPrompt(): string {
  if (activeAgent && AGENTS[activeAgent]) {
    const c = AGENTS[activeAgent].color;
    const hex = c === "cyan" ? "#06b6d4" : c === "red" ? "#ef4444" : c === "yellow" ? "#f59e0b" : c === "green" ? "#10b981" : c === "magenta" ? "#d946ef" : "#3b82f6";
    return chalk.hex(hex).bold(`[${AGENTS[activeAgent].name}] > `);
  }
  return PROMPT;
}

// ─── Autocomplete ─────────────────────────────────────────
const SLASH_COMMANDS = [
  "/help", "/features", "/agents", "/clear", "/model", "/context",
  "/cost", "/compact", "/quit", "/exit",
  "/agent:code", "/agent:debug", "/agent:review",
  "/agent:refactor", "/agent:architect", "/agent:test", "/agent:off",
  "/model deepseek-reasoner", "/model deepseek-chat",
];

function completer(line: string): [string[], string] {
  if (line.startsWith("/")) {
    const hits = SLASH_COMMANDS.filter((c) => c.startsWith(line));
    return [hits.length ? hits : SLASH_COMMANDS, line];
  }
  return [[], line];
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: PROMPT,
  terminal: process.stdin.isTTY !== false,
  completer,
});

rl.prompt();

let multilineBuffer = "";
let isMultiline = false;

rl.on("line", async (line) => {
  // Multiline support: end line with \ to continue
  if (line.endsWith("\\\\") || line.endsWith("\\")) {
    multilineBuffer += line.slice(0, -1) + "\n";
    isMultiline = true;
    process.stdout.write(chalk.gray("... "));
    return;
  }

  const input = isMultiline ? multilineBuffer + line : line;
  multilineBuffer = "";
  isMultiline = false;

  try {
    await processInput(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n  Fehler: ${msg}`));
    console.error(chalk.gray("  Tippe /help fuer Hilfe.\n"));
  }
  rl.setPrompt(getPrompt());
  rl.prompt();
});

rl.on("close", () => {
  console.log(chalk.magenta("\n  " + STAR + " Bis bald!\n"));
  process.exit(0);
});

// Keep process alive
setInterval(() => {}, 1 << 30);
