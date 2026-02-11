import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import { Banner } from "./components/Banner.js";
import { Help } from "./components/Help.js";
import { Features } from "./components/Features.js";
import { Input } from "./components/Input.js";
import { StreamingOutput } from "./components/StreamingOutput.js";
import { MorningstarSpinner } from "./components/Spinner.js";
import { ToolResult as ToolResultBox } from "./components/ToolResult.js";
import { CodeBlock } from "./components/CodeBlock.js";
import { PlanBox } from "./components/PlanBox.js";
import { useTheme } from "./hooks/useTheme.js";
import { streamChat } from "./ai.js";
import { executeToolCalls, toolStats, webSearch, fetchUrl } from "./tools.js";
import { detectProject, buildSystemPrompt } from "./context.js";
import { AGENTS, getAgentPrompt, listAgents } from "./agents.js";
import type { Agent } from "./agents.js";
import { getAllAgents, createAgent, editAgent, deleteAgent, isBuiltinAgent, loadCustomAgents } from "./custom-agents.js";
import { addMemory, removeMemory, loadMemories, searchMemories, clearMemories, getMemoryContext } from "./memory.js";
import { addTodo, toggleTodo, removeTodo, loadTodos, clearDoneTodos, clearAllTodos, getTodoStats } from "./todo.js";
import { saveConversation, loadConversation, listConversations, deleteConversation } from "./history.js";
import { undoLastChange, getUndoStack, getUndoStackSize, clearUndoStack } from "./undo.js";
import { THEMES, setTheme as setThemeId, getTheme, getThemeId, listThemes } from "./theme.js";
import type { Message, CLIConfig, ProjectContext } from "./types.js";
import { detectProvider, getProviderBaseUrl, getProviderApiKeyEnv, resolveApiKey, listProviders, getModelDisplayName } from "./providers.js";
import { getPermissionMode, setPermissionMode } from "./permissions.js";
import { loadSettings, initProjectSettings, projectSettingsExist, getProjectSettingsPath, getGlobalSettingsPath } from "./settings.js";
import { loadProjectMemory } from "./project-memory.js";
import { trackUsage, getSessionCosts, formatCostDisplay, isFreeTier } from "./cost-tracker.js";
import { getRepoMap, generateOnboarding, generateProjectScore, generateCodeRoast } from "./repo-map.js";
import { parseMentions, formatMentionContext } from "./mentions.js";

interface AppProps {
  config: CLIConfig;
  ctx: ProjectContext;
  chatOnly: boolean;
  skipPermissions: boolean;
  baseSystemPrompt: string;
  sessionStart: number;
  getStoredApiKey: (provider: string) => string;
  storeApiKey: (provider: string, key: string) => void;
  saveConfig: (data: Record<string, unknown>) => void;
}

// Output item types
interface OutputItem {
  id: number;
  type: "banner" | "text" | "help" | "features" | "streaming" | "ai-response" | "spinner" | "tool-result" | "tool-activity" | "info" | "error" | "success";
  content?: string;
  // For tool results
  tool?: string;
  result?: string;
  success?: boolean;
  diff?: { filePath: string; oldStr: string; newStr: string };
  filePath?: string;
  linesChanged?: number;
  command?: string;
  // For streaming
  streamingText?: string;
  streamingReasoning?: string;
  startTime?: number;
}

// All slash commands for autocomplete
interface SlashCmd { cmd: string; desc: string }

function buildSlashCommands(): SlashCmd[] {
  const cmds: SlashCmd[] = [
    { cmd: "/help", desc: "Alle Befehle" },
    { cmd: "/features", desc: "Alle Features" },
    { cmd: "/clear", desc: "Konversation zuruecksetzen" },
    { cmd: "/compact", desc: "Komprimieren" },
    { cmd: "/stats", desc: "Session-Statistiken" },
    { cmd: "/plan", desc: "Plan-Modus an/aus" },
    { cmd: "/think", desc: "Think-Modus" },
    { cmd: "/review", desc: "Code Review" },
    { cmd: "/agents", desc: "Agenten anzeigen" },
    { cmd: "/agent:create", desc: "Neuen Agent erstellen" },
    { cmd: "/agent:off", desc: "Agent deaktivieren" },
    { cmd: "/model", desc: "Model wechseln" },
    { cmd: "/provider", desc: "Provider anzeigen/wechseln" },
    { cmd: "/providers", desc: "Alle Provider anzeigen" },
    { cmd: "/context", desc: "Projekt-Kontext" },
    { cmd: "/cost", desc: "Kosten-Tracking" },
    { cmd: "/permissions", desc: "Permission-Modus" },
    { cmd: "/settings", desc: "Projekt-Settings" },
    { cmd: "/settings init", desc: "Settings erstellen" },
    { cmd: "/onboard", desc: "Projekt-Onboarding" },
    { cmd: "/score", desc: "Projekt-Score" },
    { cmd: "/roast", desc: "Code Roast" },
    { cmd: "/map", desc: "Codebase Map" },
    { cmd: "/diff", desc: "Git diff" },
    { cmd: "/status", desc: "Git status" },
    { cmd: "/log", desc: "Git log" },
    { cmd: "/branch", desc: "Git branches" },
    { cmd: "/commit", desc: "Smart Commit" },
    { cmd: "/init", desc: "MORNINGSTAR.md erstellen" },
    { cmd: "/undo", desc: "Letzte Aenderung rueckgaengig" },
    { cmd: "/search", desc: "Im Projekt suchen" },
    { cmd: "/memory add", desc: "Notiz speichern" },
    { cmd: "/memory list", desc: "Notizen anzeigen" },
    { cmd: "/todo add", desc: "Aufgabe hinzufuegen" },
    { cmd: "/todo list", desc: "Aufgaben anzeigen" },
    { cmd: "/history save", desc: "Session speichern" },
    { cmd: "/history list", desc: "Sessions anzeigen" },
    { cmd: "/history load", desc: "Session laden" },
    { cmd: "/theme", desc: "Theme wechseln" },
    ...Object.keys(THEMES).map(id => ({ cmd: `/theme ${id}`, desc: `Theme: ${THEMES[id].name}` })),
    { cmd: "/config", desc: "Konfiguration" },
    { cmd: "/doctor", desc: "Setup diagnostizieren" },
    { cmd: "/vision", desc: "Bild analysieren" },
    { cmd: "/imagine", desc: "Bild generieren" },
    { cmd: "/serve", desc: "API Server starten" },
    { cmd: "/quit", desc: "Beenden" },
  ];

  // Add agent commands
  const allAgents = getAllAgents();
  for (const [id] of Object.entries(allAgents)) {
    cmds.push({ cmd: `/agent:${id}`, desc: `Agent: ${allAgents[id].name}` });
  }

  // Add model commands
  for (const p of listProviders()) {
    for (const m of p.models.filter((m: string) => !m.startsWith("("))) {
      cmds.push({ cmd: `/model ${m}`, desc: `${getModelDisplayName(m)} [${p.name}]` });
    }
  }

  return cmds;
}

export function App({ config: initialConfig, ctx, chatOnly, skipPermissions, baseSystemPrompt, sessionStart, getStoredApiKey, storeApiKey, saveConfig }: AppProps) {
  const { exit } = useApp();
  const { primary, success: successColor, error: errorColor, warning, info, dim, accent, star } = useTheme();

  // ── State ──
  const [config, setConfig] = useState<CLIConfig>(initialConfig);
  const [messages, setMessages] = useState<Message[]>([{ role: "system", content: getFullSystemPrompt() }]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [planMode, setPlanMode] = useState(false);
  const [thinkMode, setThinkMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [output, setOutput] = useState<OutputItem[]>([{ id: 0, type: "banner" }]);
  const [slashCommands] = useState<SlashCmd[]>(() => buildSlashCommands());
  const abortRef = useRef<AbortController | null>(null);

  // Streaming state
  const [streamText, setStreamText] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStart, setStreamStart] = useState(0);
  const [streamedChars, setStreamedChars] = useState(0);

  let nextId = useRef(1);
  function addOutput(item: Omit<OutputItem, "id">): void {
    setOutput(prev => [...prev, { ...item, id: nextId.current++ }]);
  }

  function getFullSystemPrompt(): string {
    let prompt = baseSystemPrompt + getMemoryContext();
    const projectMem = loadProjectMemory(ctx.cwd);
    if (projectMem) prompt += `\n\n--- Project Memory (MORNINGSTAR.md) ---\n${projectMem}\n--- Ende ---`;
    return prompt;
  }

  // ── SIGINT handler ──
  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      if (isProcessing && abortRef.current) {
        abortRef.current.abort();
        setIsProcessing(false);
        setIsStreaming(false);
        addOutput({ type: "info", content: "Abgebrochen." });
      } else {
        addOutput({ type: "text", content: "* Bis bald!" });
        setTimeout(() => exit(), 100);
      }
    }
  });

  // ── Slash Command Handler ──
  function handleSlashCommand(input: string): boolean {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ");

    switch (cmd) {
      case "/help":
        addOutput({ type: "help" });
        return true;

      case "/features":
        addOutput({ type: "features" });
        return true;

      case "/clear":
        setMessages([{ role: "system", content: getFullSystemPrompt() }]);
        clearUndoStack();
        addOutput({ type: "success", content: "Konversation zurueckgesetzt." });
        return true;

      case "/compact":
        setMessages(prev => {
          if (prev.length <= 3) return prev;
          const keep = prev.length > 6 ? prev.slice(-4) : prev.slice(-2);
          return [prev[0], ...keep];
        });
        addOutput({ type: "success", content: "Konversation komprimiert." });
        return true;

      case "/plan":
        setPlanMode(prev => {
          const next = !prev;
          addOutput({ type: next ? "info" : "success", content: next ? "Plan-Modus AN — KI wird erst planen, dann handeln." : "Plan-Modus AUS — KI handelt direkt." });
          return next;
        });
        return true;

      case "/think":
        setThinkMode(prev => {
          const next = !prev;
          addOutput({ type: next ? "info" : "success", content: next ? "Think-Modus AN — KI denkt Schritt fuer Schritt nach." : "Think-Modus AUS — Normale Antworten." });
          return next;
        });
        return true;

      case "/model":
        if (arg) {
          const newProv = detectProvider(arg);
          const newConfig = { ...config, model: arg, provider: newProv, baseUrl: getProviderBaseUrl(newProv), apiKey: getStoredApiKey(newProv) };
          setConfig(newConfig);
          saveConfig({ model: arg, provider: newProv, baseUrl: newConfig.baseUrl });
          addOutput({ type: "success", content: `Model: ${getModelDisplayName(arg)} [${newProv}]` });
        } else {
          addOutput({ type: "info", content: `Aktuelles Model: ${getModelDisplayName(config.model)} [${config.provider || detectProvider(config.model)}]\nNutze /model <id> zum Wechseln.` });
        }
        return true;

      case "/provider":
        if (arg) {
          const providers = listProviders();
          const found = providers.find((p: any) => p.name === arg.toLowerCase());
          if (found) {
            const defaultModel = found.models[0]?.startsWith("(") ? config.model : found.models[0];
            const newConfig = { ...config, provider: found.name, baseUrl: getProviderBaseUrl(found.name), model: defaultModel };
            setConfig(newConfig);
            saveConfig({ provider: found.name, model: defaultModel, baseUrl: newConfig.baseUrl });
            addOutput({ type: "success", content: `Provider: ${found.name}, Model: ${getModelDisplayName(defaultModel)}` });
          } else {
            addOutput({ type: "error", content: `Provider "${arg}" nicht gefunden. Verfuegbar: ${providers.map((p: any) => p.name).join(", ")}` });
          }
        } else {
          addOutput({ type: "info", content: `Provider: ${config.provider || detectProvider(config.model)}` });
        }
        return true;

      case "/providers": {
        const providers = listProviders();
        let text = "Verfuegbare Provider:\n\n";
        for (const p of providers) {
          const active = p.name === (config.provider || detectProvider(config.model)) ? " ★" : "";
          text += `  ${p.name}${active}\n    Models: ${p.models.join(", ")}\n    API Key: ${p.envKey}\n\n`;
        }
        addOutput({ type: "info", content: text });
        return true;
      }

      case "/context":
        addOutput({ type: "info", content: `Projekt-Kontext:\n  CWD: ${ctx.cwd}\n  Name: ${ctx.projectName}\n  Sprache: ${ctx.language || "unbekannt"}\n  Framework: ${ctx.framework || "keins"}\n  Git: ${ctx.hasGit ? ctx.gitBranch || "ja" : "nein"}\n  Dateien: ${ctx.files.length}` });
        return true;

      case "/cost": {
        addOutput({ type: "info", content: `Kosten-Tracking:\n\n${formatCostDisplay()}${isFreeTier(config.model) ? "\n\n  Aktuelles Model ist kostenlos!" : ""}` });
        return true;
      }

      case "/stats": {
        const elapsed = Math.round((Date.now() - sessionStart) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const costs = getSessionCosts();
        let text = `Session-Statistiken:\n\n  Laufzeit:        ${mins}m ${secs}s\n  Messages:        ${messages.length}\n  Tool-Aufrufe:    ${toolStats.calls}\n  Dateien gelesen: ${toolStats.filesRead}\n  Dateien geschrieben: ${toolStats.filesWritten}\n  Dateien bearbeitet:  ${toolStats.filesEdited}\n  Bash-Befehle:    ${toolStats.bashCommands}\n  Undo-Stack:      ${getUndoStackSize()}\n  Model:           ${getModelDisplayName(config.model)}\n  Provider:        ${config.provider || detectProvider(config.model)}\n  Agent:           ${activeAgent || "keiner"}\n  Plan-Modus:      ${planMode ? "AN" : "AUS"}\n  Think-Modus:     ${thinkMode ? "AN" : "AUS"}`;
        if (costs.messages > 0) text += `\n  Kosten:          $${costs.totalCost.toFixed(4)}`;
        addOutput({ type: "info", content: text });
        return true;
      }

      case "/permissions":
        if (arg && ["auto", "ask", "strict"].includes(arg.toLowerCase())) {
          setPermissionMode(arg.toLowerCase() as "auto" | "ask" | "strict");
          addOutput({ type: "success", content: `Permission-Modus: ${arg.toLowerCase()}` });
        } else {
          addOutput({ type: "info", content: `Permission-Modus: ${getPermissionMode()}\n  auto  — alle Tools ohne Nachfrage\n  ask   — bei write/edit/delete nachfragen\n  strict — bei jedem Tool nachfragen` });
        }
        return true;

      case "/settings":
        if (arg === "init") {
          const path = initProjectSettings(ctx.cwd);
          addOutput({ type: "success", content: `Settings erstellt: ${path}` });
        } else {
          addOutput({ type: "info", content: `Settings:\n  Global:  ${getGlobalSettingsPath()}\n  Projekt: ${projectSettingsExist(ctx.cwd) ? getProjectSettingsPath(ctx.cwd) : "nicht vorhanden"}\n\n  /settings init — Erstellen` });
        }
        return true;

      // Git commands
      case "/diff":
      case "/status":
      case "/log":
      case "/branch": {
        const { execSync } = require("node:child_process");
        try {
          let gitCmd: string;
          if (cmd === "/diff") gitCmd = arg === "staged" ? "git diff --cached" : "git diff";
          else if (cmd === "/status") gitCmd = "git status";
          else if (cmd === "/log") gitCmd = `git log --oneline -${arg ? parseInt(arg, 10) || 10 : 10}`;
          else gitCmd = "git branch -a";
          const result = execSync(gitCmd, { cwd: ctx.cwd, encoding: "utf-8", timeout: 10000 }).trim();
          addOutput({ type: "text", content: result || "Keine Aenderungen." });
        } catch (e) {
          addOutput({ type: "error", content: `Git Fehler: ${(e as Error).message}` });
        }
        return true;
      }

      // Codebase Analysis
      case "/onboard":
        addOutput({ type: "info", content: "Projekt-Onboarding...\n\n" + generateOnboarding(ctx.cwd) });
        return true;

      case "/score": {
        const score = generateProjectScore(ctx.cwd);
        const bar = (label: string, val: number) => {
          const filled = Math.round(val / 5);
          const empty = 20 - filled;
          return `  ${label.padEnd(16)} ${"█".repeat(filled)}${"░".repeat(empty)} ${val}%`;
        };
        addOutput({ type: "info", content: `Projekt-Score:\n\n${bar("Quality", score.quality)}\n${bar("Test Coverage", score.testCoverage)}\n${bar("Type Safety", score.typeSafety)}\n${bar("Documentation", score.documentation)}\n${bar("Security", score.security)}\n\n  Overall: ${score.overall}%${score.quickWins.length > 0 ? "\n\n  Quick Wins:\n" + score.quickWins.map((w: string) => `    ${w}`).join("\n") : ""}` });
        return true;
      }

      case "/roast":
        addOutput({ type: "text", content: generateCodeRoast(ctx.cwd) });
        return true;

      case "/map": {
        const map = getRepoMap(ctx.cwd);
        if (map.length === 0) { addOutput({ type: "info", content: "Keine Code-Dateien gefunden." }); return true; }
        const lines = map.slice(0, 50).map((f: any) => {
          let line = `  ${f.path} (${f.lines} Zeilen)`;
          if (f.exports.length > 0) line += `\n    exports: ${f.exports.join(", ")}`;
          if (f.imports.length > 0) line += `\n    imports: ${f.imports.join(", ")}`;
          return line;
        });
        addOutput({ type: "text", content: lines.join("\n") + (map.length > 50 ? `\n\n  ... +${map.length - 50} weitere Dateien` : "") });
        return true;
      }

      // Init
      case "/init": {
        const { existsSync, writeFileSync } = require("node:fs");
        const { join } = require("node:path");
        const mdPath = join(ctx.cwd, "MORNINGSTAR.md");
        if (existsSync(mdPath)) { addOutput({ type: "info", content: "MORNINGSTAR.md existiert bereits." }); return true; }
        const content = `# ${ctx.projectName}\n\n## Projekt-Notizen\n\n- Sprache: ${ctx.language || "unbekannt"}\n- Framework: ${ctx.framework || "keins"}\n- Erstellt: ${new Date().toISOString().split("T")[0]}\n\n## Konventionen\n\n- \n\n## Wichtige Dateien\n\n- \n\n## TODOs\n\n- [ ] \n`;
        writeFileSync(mdPath, content, "utf-8");
        addOutput({ type: "success", content: "MORNINGSTAR.md erstellt!" });
        return true;
      }

      // Undo
      case "/undo":
        if (arg === "list") {
          const stack = getUndoStack();
          if (stack.length === 0) { addOutput({ type: "info", content: "Undo-Stack ist leer." }); return true; }
          const lines = stack.map((c, i) => `  ${i === stack.length - 1 ? "→ " : "  "}[${c.type}] ${c.description} ${c.timestamp.split("T")[1]?.slice(0, 8) || ""}`).reverse();
          addOutput({ type: "info", content: `Undo-Stack:\n\n${lines.join("\n")}` });
        } else {
          const result = undoLastChange();
          addOutput({ type: result.success ? "success" : "error", content: result.message });
        }
        return true;

      // Search
      case "/search":
        if (!arg) { addOutput({ type: "error", content: "Nutzung: /search <query>" }); return true; }
        try {
          const { execSync } = require("node:child_process");
          const results = execSync(`grep -rn "${arg.replace(/"/g, '\\"')}" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" --include="*.rs" --include="*.java" --include="*.css" --include="*.json" --include="*.md" 2>/dev/null | head -30`, { cwd: ctx.cwd, encoding: "utf-8", timeout: 10000 }).trim();
          addOutput({ type: "text", content: results || `Keine Treffer fuer "${arg}".` });
        } catch { addOutput({ type: "info", content: `Keine Treffer fuer "${arg}".` }); }
        return true;

      // Memory
      case "/memory": {
        const subCmd = parts[1]?.toLowerCase();
        const memArg = parts.slice(2).join(" ");
        if (!subCmd || subCmd === "list") {
          const mems = loadMemories();
          if (mems.length === 0) { addOutput({ type: "info", content: "Keine Notizen gespeichert. Nutze /memory add <text>" }); return true; }
          addOutput({ type: "info", content: `Gespeicherte Notizen:\n\n${mems.map((m: any) => `  #${m.id}  ${m.text}${m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : ""}`).join("\n")}` });
          return true;
        }
        if (subCmd === "add" && memArg) {
          const tags = memArg.match(/#\w+/g)?.map((t: string) => t.slice(1)) || [];
          const text = memArg.replace(/#\w+/g, "").trim();
          const entry = addMemory(text, tags);
          setMessages(prev => {
            const updated = [...prev];
            updated[0] = { role: "system", content: activeAgent ? getAgentPrompt(activeAgent, getFullSystemPrompt(), getAllAgents()) : getFullSystemPrompt() };
            return updated;
          });
          addOutput({ type: "success", content: `Notiz #${entry.id} gespeichert.` });
          return true;
        }
        if (subCmd === "search" && memArg) {
          const results = searchMemories(memArg);
          addOutput({ type: "info", content: results.length === 0 ? `Keine Treffer fuer "${memArg}".` : `Treffer:\n\n${results.map((m: any) => `  #${m.id}  ${m.text}`).join("\n")}` });
          return true;
        }
        if ((subCmd === "remove" || subCmd === "delete") && memArg) {
          const id = parseInt(memArg, 10);
          if (removeMemory(id)) addOutput({ type: "success", content: `Notiz #${id} geloescht.` });
          else addOutput({ type: "error", content: `Notiz #${id} nicht gefunden.` });
          return true;
        }
        if (subCmd === "clear") {
          const count = clearMemories();
          addOutput({ type: "success", content: `${count} Notiz(en) geloescht.` });
          return true;
        }
        addOutput({ type: "error", content: "Nutzung: /memory add|list|search|remove|clear" });
        return true;
      }

      // Todo
      case "/todo": {
        const subCmd = parts[1]?.toLowerCase();
        const todoArg = parts.slice(2).join(" ");
        if (!subCmd || subCmd === "list") {
          const todos = loadTodos();
          if (todos.length === 0) { addOutput({ type: "info", content: "Keine Aufgaben. Nutze /todo add <text>" }); return true; }
          const stats = getTodoStats();
          addOutput({ type: "info", content: `Aufgaben:\n\n${todos.map((td: any) => `  ${td.done ? "✓" : "○"} #${td.id} ${td.done ? `~~${td.text}~~` : td.text}${td.priority === "high" ? " !!" : td.priority === "low" ? " ↓" : ""}`).join("\n")}\n\n  ${stats.done}/${stats.total} erledigt` });
          return true;
        }
        if (subCmd === "add" && todoArg) {
          let priority: "low" | "normal" | "high" = "normal";
          let text = todoArg;
          if (todoArg.includes("!high")) { priority = "high"; text = todoArg.replace("!high", "").trim(); }
          else if (todoArg.includes("!low")) { priority = "low"; text = todoArg.replace("!low", "").trim(); }
          const item = addTodo(text, priority);
          addOutput({ type: "success", content: `Aufgabe #${item.id} hinzugefuegt.` });
          return true;
        }
        if ((subCmd === "done" || subCmd === "toggle") && todoArg) {
          const id = parseInt(todoArg, 10);
          const item = toggleTodo(id);
          if (item) addOutput({ type: "success", content: `#${id} ${item.done ? "erledigt" : "wieder offen"}.` });
          else addOutput({ type: "error", content: `Aufgabe #${id} nicht gefunden.` });
          return true;
        }
        if ((subCmd === "remove" || subCmd === "delete") && todoArg) {
          const id = parseInt(todoArg, 10);
          if (removeTodo(id)) addOutput({ type: "success", content: `Aufgabe #${id} geloescht.` });
          else addOutput({ type: "error", content: `Aufgabe #${id} nicht gefunden.` });
          return true;
        }
        if (subCmd === "clear") {
          if (todoArg === "all") addOutput({ type: "success", content: `${clearAllTodos()} Aufgabe(n) geloescht.` });
          else addOutput({ type: "success", content: `${clearDoneTodos()} erledigte Aufgabe(n) entfernt.` });
          return true;
        }
        addOutput({ type: "error", content: "Nutzung: /todo add|list|done|remove|clear" });
        return true;
      }

      // History
      case "/history": {
        const subCmd = parts[1]?.toLowerCase();
        if (!subCmd || subCmd === "list") {
          const convs = listConversations();
          if (convs.length === 0) { addOutput({ type: "info", content: "Keine gespeicherten Sessions." }); return true; }
          addOutput({ type: "info", content: `Gespeicherte Sessions:\n\n${convs.slice(0, 20).map((c: any) => `  ${c.id}  ${c.name} (${c.messageCount} msgs, ${c.savedAt.split("T")[0]})`).join("\n")}\n\n  /history load <id> zum Laden` });
          return true;
        }
        if (subCmd === "save") {
          const name = parts.slice(2).join(" ") || `Session ${new Date().toLocaleString("de-DE")}`;
          const conv = saveConversation(name, messages, config.model, ctx.projectName);
          addOutput({ type: "success", content: `Session gespeichert: ${conv.id} "${name}"` });
          return true;
        }
        if (subCmd === "load" && parts[2]) {
          const conv = loadConversation(parts[2]);
          if (!conv) { addOutput({ type: "error", content: `Session "${parts[2]}" nicht gefunden.` }); return true; }
          setMessages(conv.messages);
          addOutput({ type: "success", content: `Session "${conv.name}" geladen (${conv.messageCount} messages).` });
          return true;
        }
        if (subCmd === "delete" && parts[2]) {
          if (deleteConversation(parts[2])) addOutput({ type: "success", content: `Session "${parts[2]}" geloescht.` });
          else addOutput({ type: "error", content: `Session "${parts[2]}" nicht gefunden.` });
          return true;
        }
        addOutput({ type: "error", content: "Nutzung: /history save|list|load|delete" });
        return true;
      }

      // Theme
      case "/theme":
        if (arg) {
          if (setThemeId(arg)) {
            saveConfig({ theme: arg });
            addOutput({ type: "success", content: `Theme: ${getTheme().name}` });
          } else {
            addOutput({ type: "error", content: `Theme "${arg}" nicht gefunden. Verfuegbar: ${Object.keys(THEMES).join(", ")}` });
          }
        } else {
          const themes = listThemes();
          addOutput({ type: "info", content: `Verfuegbare Themes:\n\n${themes.map((th: any) => `  ${th.name}${th.active ? " ★ aktiv" : ""}`).join("\n")}\n\n  /theme <name> zum Wechseln` });
        }
        return true;

      // Config
      case "/config":
        addOutput({ type: "info", content: `Konfiguration:\n\n  provider:    ${config.provider || detectProvider(config.model)}\n  model:       ${getModelDisplayName(config.model)}\n  baseUrl:     ${config.baseUrl}\n  maxTokens:   ${config.maxTokens}\n  temperature: ${config.temperature}\n  theme:       ${getThemeId()}\n\n  /config set <key> <value> zum Aendern` });
        return true;

      // Doctor
      case "/doctor": {
        const { existsSync } = require("node:fs");
        const { execSync } = require("node:child_process");
        const { join } = require("node:path");
        const { homedir } = require("node:os");
        const CONFIG_DIR = join(homedir(), ".morningstar");
        const checks: string[] = [];
        checks.push(`  ✓ Node.js        ${process.version}`);
        checks.push(`  ${config.apiKey ? "✓" : "✗"} API Key        ${config.apiKey ? "gesetzt" : "FEHLT"}`);
        checks.push(`  ${existsSync(CONFIG_DIR) ? "✓" : "✗"} Config Dir     ${CONFIG_DIR}`);
        let gitOk = false;
        try { execSync("git --version", { encoding: "utf-8", timeout: 3000 }); gitOk = true; } catch {}
        checks.push(`  ${gitOk ? "✓" : "✗"} Git            ${gitOk ? "installiert" : "nicht gefunden"}`);
        checks.push(`  ${ctx.hasGit ? "✓" : "✗"} Git Repo       ${ctx.hasGit ? `Branch: ${ctx.gitBranch}` : "kein .git"}`);
        checks.push(`  ${ctx.language ? "✓" : "✗"} Projekt        ${ctx.language ? `${ctx.language}${ctx.framework ? " / " + ctx.framework : ""}` : "nicht erkannt"}`);
        checks.push(`  ✓ Provider       ${config.provider || detectProvider(config.model)} (${getModelDisplayName(config.model)})`);
        addOutput({ type: "info", content: `Morningstar Diagnose:\n\n${checks.join("\n")}` });
        return true;
      }

      // Agents
      case "/agents":
      case "/agent:list": {
        const allAgents = getAllAgents();
        let text = "Built-in Agenten:\n\n" + listAgents(AGENTS) + "\n";
        const custom = loadCustomAgents();
        if (Object.keys(custom).length > 0) {
          text += "\n  Custom Agenten:\n\n" + listAgents(allAgents, true);
        }
        if (activeAgent) text += `\n\n  Aktiv: ${allAgents[activeAgent]?.name || activeAgent}`;
        text += "\n\n  /agent:<id> zum Aktivieren · /agent:off zum Deaktivieren";
        addOutput({ type: "info", content: text });
        return true;
      }

      case "/quit":
      case "/exit":
      case "/q":
        addOutput({ type: "text", content: "* Bis bald!" });
        setTimeout(() => exit(), 100);
        return true;

      default:
        // Agent activation
        if (cmd.startsWith("/agent:")) {
          const agentId = cmd.slice(7);
          if (agentId === "off" || agentId === "none") {
            setActiveAgent(null);
            setMessages(prev => {
              const updated = [...prev];
              updated[0] = { role: "system", content: getFullSystemPrompt() };
              return updated;
            });
            addOutput({ type: "success", content: "Agent deaktiviert. Standard-Modus." });
            return true;
          }
          const allAgents = getAllAgents();
          if (allAgents[agentId]) {
            setActiveAgent(agentId);
            setMessages(prev => {
              const updated = [...prev];
              updated[0] = { role: "system", content: getAgentPrompt(agentId, getFullSystemPrompt(), allAgents) };
              return updated;
            });
            addOutput({ type: "success", content: `${allAgents[agentId].name} aktiviert — ${allAgents[agentId].description}` });
            return true;
          }
          addOutput({ type: "error", content: `Unbekannter Agent: ${agentId}. Verfuegbar: ${Object.keys(allAgents).join(", ")}` });
          return true;
        }
        return false;
    }
  }

  // ── Process Input ──
  const processInput = useCallback(async (input: string) => {
    if (!input.trim()) return;

    // Handle slash commands
    if (input.startsWith("/")) {
      const handled = handleSlashCommand(input);
      if (handled) return;
    }

    setIsProcessing(true);
    const abort = new AbortController();
    abortRef.current = abort;
    const signal = abort.signal;

    // Parse @-mentions
    const { cleanInput: mentionClean, mentions } = parseMentions(input, ctx.cwd);
    const mentionContext = formatMentionContext(mentions);
    if (mentions.length > 0) {
      addOutput({ type: "info", content: `${mentions.length} @-Mention(s) aufgeloest` });
    }

    // Build user content
    let userContent = planMode
      ? `[PLAN-MODUS] Erstelle zuerst einen detaillierten Plan bevor du handelst.\n\n${mentionClean}`
      : thinkMode
      ? `Denke Schritt fuer Schritt nach. Nutze <think>...</think> Tags fuer deinen Denkprozess.\n\n${mentionClean}`
      : mentionClean;
    if (mentionContext) userContent = mentionContext + "\n\n" + userContent;

    // Auto web search / fetch
    if (!chatOnly) {
      const lower = mentionClean.toLowerCase();
      const urlMatch = mentionClean.match(/https?:\/\/\S+/i);
      const webKeywords = ["such", "find", "google", "recherch", "was ist", "wer ist", "how to"];
      const isWebQuery = webKeywords.some(k => lower.includes(k));

      if (urlMatch) {
        addOutput({ type: "tool-activity", content: `Fetch(${urlMatch[0]})` });
        try {
          const fetchResult = await fetchUrl(urlMatch[0]);
          addOutput({ type: "tool-result", tool: "fetch", result: fetchResult.result, success: fetchResult.success });
          userContent += `\n\n--- Inhalt von ${urlMatch[0]} ---\n${fetchResult.result.slice(0, 3000)}\n--- Ende ---`;
        } catch {}
      } else if (isWebQuery) {
        const searchQuery = mentionClean.replace(/^(suche?|finde?|google|recherchiere)\s*/i, "").trim() || mentionClean;
        addOutput({ type: "tool-activity", content: `WebSearch("${searchQuery}")` });
        try {
          const searchResult = await webSearch(searchQuery);
          addOutput({ type: "tool-result", tool: "web", result: searchResult.result, success: searchResult.success });
          userContent += `\n\n--- Web-Suchergebnisse ---\n${searchResult.result}\n--- Ende ---`;
        } catch {}
      }
    }

    // Add user message
    const newMessages = [...messages, { role: "user" as const, content: userContent }];
    setMessages(newMessages);

    // Show user input in output
    addOutput({ type: "text", content: `> ${input}` });

    // Start streaming
    setStreamText("");
    setStreamReasoning("");
    setIsStreaming(true);
    setStreamStart(Date.now());
    setStreamedChars(0);

    // Helper: save completed AI response to persistent output
    const saveResponseToOutput = (text: string, reasoning: string, start: number) => {
      if (text || reasoning) {
        addOutput({ type: "ai-response", streamingText: text, streamingReasoning: reasoning, startTime: start });
      }
      setStreamText("");
      setStreamReasoning("");
    };

    try {
      let fullResponse = "";
      let fullReasoning = "";
      for await (const token of streamChat(newMessages, config, signal)) {
        if (signal.aborted) break;
        if (token.type === "reasoning") {
          fullReasoning += token.text;
          setStreamReasoning(prev => prev + token.text);
        } else {
          fullResponse += token.text;
          setStreamText(prev => prev + token.text);
          setStreamedChars(prev => prev + token.text.length);
        }
      }

      if (signal.aborted || !fullResponse) {
        // Still save any partial response that was shown
        saveResponseToOutput(fullResponse, fullReasoning, streamStart);
        setIsProcessing(false);
        setIsStreaming(false);
        return;
      }

      trackUsage(config.model, userContent, fullResponse);

      // Execute tools
      if (!chatOnly) {
        let toolResults: Awaited<ReturnType<typeof executeToolCalls>> | null = null;
        try { toolResults = await executeToolCalls(fullResponse, ctx.cwd); } catch {}

        if (toolResults && toolResults.results.length > 0) {
          // Save initial AI response to output BEFORE showing tool results
          saveResponseToOutput(fullResponse, fullReasoning, streamStart);
          setIsStreaming(false);

          // Show tool results — Claude Code style
          for (const r of toolResults.results) {
            addOutput({ type: "tool-result", tool: r.tool, result: r.result, success: r.success, diff: r.diff, filePath: r.filePath, linesChanged: r.linesChanged, command: r.command });
          }

          const toolFeedback = toolResults.results.map(r => `[Tool: ${r.tool}] ${r.success ? "Erfolg" : "Fehler"}: ${r.result}`).join("\n\n");
          const msgsWithAssistant = [...newMessages, { role: "assistant" as const, content: fullResponse }, { role: "user" as const, content: `Tool-Ergebnisse:\n${toolFeedback}\n\nFahre fort.` }];
          setMessages(msgsWithAssistant);

          // Follow-up streaming
          setIsStreaming(true);
          setStreamStart(Date.now());
          let currentResponse = "";
          let currentReasoning = "";
          const followUpStart = Date.now();
          try {
            for await (const token of streamChat(msgsWithAssistant, config, signal)) {
              if (signal.aborted) break;
              if (token.type === "reasoning") { currentReasoning += token.text; setStreamReasoning(prev => prev + token.text); }
              else { currentResponse += token.text; setStreamText(prev => prev + token.text); }
            }
          } catch {}

          // Multi-turn tool loop (max 5 rounds)
          let depth = 0;
          let latestMessages = msgsWithAssistant;
          while (depth < 5 && currentResponse && !signal.aborted) {
            let nested: Awaited<ReturnType<typeof executeToolCalls>> | null = null;
            try { nested = await executeToolCalls(currentResponse, ctx.cwd); } catch { break; }
            if (!nested || nested.results.length === 0) break;

            // Save current response before showing tool results
            saveResponseToOutput(currentResponse, currentReasoning, followUpStart);
            setIsStreaming(false);

            for (const r of nested.results) addOutput({ type: "tool-result", tool: r.tool, result: r.result, success: r.success, diff: r.diff, filePath: r.filePath, linesChanged: r.linesChanged, command: r.command });
            const nestedFeedback = nested.results.map(r => `[Tool: ${r.tool}] ${r.success ? "Erfolg" : "Fehler"}: ${r.result}`).join("\n\n");
            latestMessages = [...latestMessages, { role: "assistant" as const, content: currentResponse }, { role: "user" as const, content: `Tool-Ergebnisse:\n${nestedFeedback}\n\nFahre fort.` }];
            setMessages(latestMessages);

            // Start new streaming round
            setIsStreaming(true);
            setStreamStart(Date.now());
            currentResponse = "";
            currentReasoning = "";
            try {
              for await (const token of streamChat(latestMessages, config, signal)) {
                if (signal.aborted) break;
                if (token.type === "reasoning") { currentReasoning += token.text; setStreamReasoning(prev => prev + token.text); }
                else { currentResponse += token.text; setStreamText(prev => prev + token.text); }
              }
            } catch { break; }
            depth++;
          }

          // Save final response
          if (currentResponse) {
            saveResponseToOutput(currentResponse, currentReasoning, followUpStart);
            setMessages(prev => [...prev, { role: "assistant" as const, content: currentResponse }]);
          }
        } else {
          // No tools called — save response to output
          saveResponseToOutput(fullResponse, fullReasoning, streamStart);
          setMessages(prev => [...prev, { role: "assistant" as const, content: fullResponse }]);
        }
      } else {
        // Chat only — save response to output
        saveResponseToOutput(fullResponse, fullReasoning, streamStart);
        setMessages(prev => [...prev, { role: "assistant" as const, content: fullResponse }]);
      }
    } catch (e) {
      if (!signal.aborted) {
        addOutput({ type: "error", content: `Fehler: ${(e as Error).message}` });
      }
    } finally {
      setIsProcessing(false);
      setIsStreaming(false);
      setStreamText("");
      setStreamReasoning("");
      abortRef.current = null;
    }
  }, [messages, config, activeAgent, planMode, thinkMode, chatOnly, ctx.cwd]);

  // ── Render output item ──
  function renderOutputItem(item: OutputItem): React.ReactNode {
    switch (item.type) {
      case "banner":
        return <Banner key={item.id} config={config} ctx={ctx} skipPermissions={skipPermissions} />;
      case "help":
        return <Help key={item.id} />;
      case "features":
        return <Features key={item.id} />;
      case "text":
        return (
          <Box key={item.id} marginLeft={2} marginY={1}>
            <Text wrap="wrap">{item.content}</Text>
          </Box>
        );
      case "info":
        return (
          <Box key={item.id} marginLeft={2} marginY={1}>
            <Text color={info} wrap="wrap">{item.content}</Text>
          </Box>
        );
      case "success":
        return (
          <Box key={item.id} marginLeft={2} marginY={1}>
            <Text color={successColor}>  ✓ {item.content}</Text>
          </Box>
        );
      case "error":
        return (
          <Box key={item.id} marginLeft={2} marginY={1}>
            <Text color={errorColor}>  ✗ {item.content}</Text>
          </Box>
        );
      case "ai-response":
        return (
          <StreamingOutput
            key={item.id}
            text={item.streamingText || ""}
            reasoning={item.streamingReasoning || ""}
            isStreaming={false}
            startTime={item.startTime || 0}
          />
        );
      case "tool-result":
        return (
          <ToolResultBox
            key={item.id}
            tool={item.tool || ""}
            result={item.result || ""}
            success={item.success ?? true}
            diff={item.diff}
            filePath={item.filePath}
            linesChanged={item.linesChanged}
            command={item.command}
          />
        );
      case "tool-activity":
        return (
          <Box key={item.id} marginLeft={2}>
            <Text color={info} bold>{"  ⏺ "}</Text>
            <Text color={info}>{item.content}</Text>
            <Text color={dim}>{" ..."}</Text>
          </Box>
        );
      default:
        return null;
    }
  }

  // ── Render ──
  return (
    <>
      {/* Static output — rendered once, scrolls naturally, no re-render flicker */}
      <Static items={output}>
        {(item) => renderOutputItem(item)}
      </Static>

      {/* Dynamic area — streaming + input, always at bottom */}
      <Box flexDirection="column">
        {/* Streaming output */}
        {isStreaming && !streamText && !streamReasoning && (
          <MorningstarSpinner startTime={streamStart} streamedChars={streamedChars} />
        )}

        {(streamText || streamReasoning) && (
          <StreamingOutput
            text={streamText}
            reasoning={streamReasoning}
            isStreaming={isStreaming}
            startTime={streamStart}
          />
        )}

        {/* Input */}
        <Box marginTop={1}>
          <Input
            onSubmit={processInput}
            activeAgent={activeAgent}
            planMode={planMode}
            thinkMode={thinkMode}
            isProcessing={isProcessing}
            suggestions={slashCommands}
          />
        </Box>
      </Box>
    </>
  );
}
