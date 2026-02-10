#!/usr/bin/env node

import { createInterface } from "node:readline";
import { resolve } from "node:path";
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

const DEFAULT_CONFIG: CLIConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || "sk-595c100043be498387b22a0cd648dc0f",
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
const config: CLIConfig = {
  ...DEFAULT_CONFIG,
  apiKey: opts.apiKey || DEFAULT_CONFIG.apiKey,
  model: opts.model || DEFAULT_CONFIG.model,
};

if (!config.apiKey) {
  console.error(chalk.red("\nFehler: DeepSeek API Key nicht gefunden!"));
  console.error(chalk.gray("Setze DEEPSEEK_API_KEY als Umgebungsvariable oder nutze --api-key\n"));
  console.error(chalk.yellow("  export DEEPSEEK_API_KEY=sk-dein-key-hier"));
  console.error(chalk.yellow("  morningstar\n"));
  process.exit(1);
}

const cwd = resolve(opts.dir || process.cwd());
const chatOnly = opts.chat || false;

// ─── Project Detection ───────────────────────────────────
const ctx = detectProject(cwd);
const systemPrompt = chatOnly
  ? "Du bist Morningstar AI, ein hilfreicher Coding-Assistant. Antworte direkt und effizient."
  : buildSystemPrompt(ctx);

// ─── State ───────────────────────────────────────────────
const messages: Message[] = [{ role: "system", content: systemPrompt }];
let totalTokensEstimate = 0;
let activeAgent: string | null = null;

// ─── UI Helpers ──────────────────────────────────────────
const STAR = chalk.magenta("*");
const PROMPT = chalk.cyan.bold("> ");
const DIVIDER = chalk.gray("─".repeat(60));

function printBanner() {
  console.log();
  console.log(chalk.magenta(`
        ${chalk.bold("*")}
       ${chalk.bold("/ \\\\")}
      ${chalk.bold("/ | \\\\")}
     ${chalk.bold("*--+--*")}
      ${chalk.bold("\\\\ | /")}
       ${chalk.bold("\\\\ /")}
        ${chalk.bold("*")}
  `));
  console.log(chalk.magenta.bold("  Morningstar AI") + chalk.gray(` v${VERSION}`));
  console.log(chalk.magenta("  Dein Terminal-Coding-Assistant\n"));
  console.log(chalk.gray(`  Model    : ${chalk.cyan(config.model)}`));
  console.log(chalk.gray(`  Projekt  : ${chalk.white(ctx.projectName)}${ctx.language ? chalk.gray(" (" + ctx.language + (ctx.framework ? " / " + ctx.framework : "") + ")") : ""}`));
  if (ctx.hasGit) console.log(chalk.gray(`  Branch   : ${chalk.yellow(ctx.gitBranch || "unknown")}`));
  console.log(chalk.gray(`  CWD      : ${cwd}`));
  console.log();
  console.log(chalk.gray("  Tools: read, write, edit, bash, grep, glob, ls, git"));
  console.log(chalk.gray("  Agents: /agent:code, /agent:debug, /agent:review, /agent:refactor"));
  console.log(chalk.gray("  Befehle: /help /clear /model /context /compact /quit"));
  console.log(DIVIDER);
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

// ─── Main Chat Loop ──────────────────────────────────────
async function processInput(input: string) {
  if (!input.trim()) return;
  if (input.startsWith("/") && handleSlashCommand(input)) return;

  messages.push({ role: "user", content: input });
  totalTokensEstimate += input.length / 3;

  const spinner = ora({ text: chalk.gray("Denkt nach..."), spinner: "dots" }).start();

  try {
    let fullResponse = "";
    let firstToken = true;

    for await (const token of streamChat(messages, config)) {
      if (firstToken) {
        spinner.stop();
        process.stdout.write("\n  " + chalk.magenta(STAR + " "));
        firstToken = false;
      }
      process.stdout.write(token);
      fullResponse += token;
    }

    if (firstToken) spinner.stop(); // no tokens received
    console.log("\n");
    totalTokensEstimate += fullResponse.length / 3;

    // Execute tool calls if not chat-only
    if (!chatOnly) {
      let toolResults: Awaited<ReturnType<typeof executeToolCalls>> | null = null;
      try {
        toolResults = await executeToolCalls(fullResponse, cwd);
      } catch (toolErr) {
        console.error(chalk.red(`\n  Tool-Ausfuehrung fehlgeschlagen: ${(toolErr as Error).message}\n`));
      }

      if (toolResults && toolResults.results.length > 0) {
        for (const r of toolResults.results) {
          printToolResult(r.tool, r.result, r.success);
        }

        // Feed tool results back to AI for follow-up
        const toolFeedback = toolResults.results
          .map((r) => `[Tool: ${r.tool}] ${r.success ? "Erfolg" : "Fehler"}: ${r.result}`)
          .join("\n\n");

        messages.push({ role: "assistant", content: fullResponse });
        messages.push({ role: "user", content: `Tool-Ergebnisse:\n${toolFeedback}\n\nFahre fort basierend auf den Ergebnissen.` });

        // Get AI follow-up (with error protection)
        let followUp = "";
        try {
          const followSpinner = ora({ text: chalk.gray("Verarbeitet Ergebnisse..."), spinner: "dots" }).start();
          let followFirst = true;

          for await (const token of streamChat(messages, config)) {
            if (followFirst) {
              followSpinner.stop();
              process.stdout.write("  " + chalk.magenta(STAR + " "));
              followFirst = false;
            }
            process.stdout.write(token);
            followUp += token;
          }

          if (followFirst) followSpinner.stop();
          console.log("\n");
        } catch (followErr) {
          console.error(chalk.red(`\n  Follow-up Fehler: ${(followErr as Error).message}\n`));
        }

        // Check for more tool calls in follow-up (recursive, max 5 rounds)
        let depth = 0;
        let currentResponse = followUp;
        while (depth < 5 && currentResponse) {
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
            const nestedSpinner = ora({ text: chalk.gray("Weiter..."), spinner: "dots" }).start();
            currentResponse = "";
            let nFirst = true;

            for await (const token of streamChat(messages, config)) {
              if (nFirst) { nestedSpinner.stop(); process.stdout.write("  " + chalk.magenta(STAR + " ")); nFirst = false; }
              process.stdout.write(token);
              currentResponse += token;
            }
            if (nFirst) nestedSpinner.stop();
            console.log("\n");
          } catch (nestedErr) {
            console.error(chalk.red(`\n  Runde ${depth + 1} Fehler: ${(nestedErr as Error).message}\n`));
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
    spinner.stop();
    console.error(chalk.red(`\n  Fehler: ${(e as Error).message}\n`));
  }
}

// ─── Global Error Handlers (prevent crashes) ────────────
process.on("uncaughtException", (err) => {
  console.error(chalk.red(`\n  Unerwarteter Fehler: ${err.message}`));
  console.error(chalk.gray("  Das Programm laeuft weiter. Tippe /help fuer Hilfe.\n"));
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(chalk.red(`\n  Async Fehler: ${msg}`));
  console.error(chalk.gray("  Das Programm laeuft weiter.\n"));
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

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: PROMPT,
  terminal: true,
});

rl.prompt();

let multilineBuffer = "";
let isMultiline = false;

rl.on("line", async (line) => {
  // Multiline support: end line with \\ to continue
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
