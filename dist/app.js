import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import { homedir } from "node:os";
import { resolve as resolvePath, join as joinPath } from "node:path";
import { existsSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { Banner } from "./components/Banner.js";
import { Help } from "./components/Help.js";
import { Features } from "./components/Features.js";
import { Input } from "./components/Input.js";
import { StreamingOutput } from "./components/StreamingOutput.js";
import { MorningstarSpinner } from "./components/Spinner.js";
import { ToolResult as ToolResultBox } from "./components/ToolResult.js";
import { ToolGroup } from "./components/ToolGroup.js";
import { ContextRadar } from "./components/ContextRadar.js";
import { buildDepGraph, renderDepGraphAscii } from "./dep-graph.js";
import { useTheme } from "./hooks/useTheme.js";
import { streamChat } from "./ai.js";
import { executeToolCalls, toolStats, webSearch, fetchUrl } from "./tools.js";
import { AGENTS, getAgentPrompt, listAgents } from "./agents.js";
import { getAllAgents, loadCustomAgents } from "./custom-agents.js";
import { addMemory, removeMemory, loadMemories, searchMemories, clearMemories, getMemoryContext } from "./memory.js";
import { addTodo, toggleTodo, removeTodo, loadTodos, clearDoneTodos, clearAllTodos, getTodoStats } from "./todo.js";
import { saveConversation, loadConversation, listConversations, deleteConversation, autoSave } from "./history.js";
import { undoLastChange, getUndoStack, getUndoStackSize, clearUndoStack } from "./undo.js";
import { THEMES, setTheme as setThemeId, getTheme, getThemeId, listThemes } from "./theme.js";
import { detectProvider, getProviderBaseUrl, getProviderApiKeyEnv, listProviders, getModelDisplayName } from "./providers.js";
import { getPermissionMode, setPermissionMode } from "./permissions.js";
import { loadSettings, initProjectSettings, projectSettingsExist, getProjectSettingsPath, getGlobalSettingsPath } from "./settings.js";
import { loadProjectMemory } from "./project-memory.js";
import { trackUsage, getSessionCosts, formatCostDisplay, isFreeTier } from "./cost-tracker.js";
import { getRepoMap, generateOnboarding, generateProjectScore, generateCodeRoast } from "./repo-map.js";
import { parseMentions, formatMentionContext } from "./mentions.js";
import { getFastModel, getDefaultModel } from "./fast-model-map.js";
import { loadCustomCommands } from "./custom-commands.js";
import { generateImage, isSetupComplete, setupImageGen, startImageServer, stopImageServer, IMAGE_MODELS } from "./image-gen.js";
import { analyzeImageFull, isOllamaRunning, isVisionModelInstalled, pullVisionModel, VISION_MODELS, DEFAULT_VISION_MODEL } from "./vision.js";
import { loadSkills, getSkill, matchSkillByTrigger, createSkill, formatSkillsList, getSkillPromptAddition } from "./skills.js";
import { migrateAgentsJsonToMd } from "./file-agents.js";
import { loadRules, createRule, formatRulesList } from "./rules.js";
import { formatHooksDisplay } from "./hooks-system.js";
import { formatMCPDisplay, getMCPServers, addMCPServer, removeMCPServer, connectMCPServer, disconnectMCPServer, getAllMCPTools } from "./mcp.js";
import { createTeam, deleteTeam, listTeams, formatTeamsList } from "./agent-teams.js";
import { createCheckpoint, listCheckpoints, restoreCheckpoint, deleteCheckpoint, formatCheckpointsList } from "./checkpoints.js";
import { enableSandbox, disableSandbox, getSandboxStatus } from "./sandbox.js";
import { getLoadedPlugins, formatPluginsList } from "./plugins.js";
import { getChromeStatus, launchChrome } from "./chrome.js";
import { getThinkingConfig, setEffortLevel, toggleThinking, getThinkingStatus, getThinkingPromptPrefix } from "./thinking.js";
import { isBudgetExceeded, getRemainingBudget } from "./cost-tracker.js";
import { isValidPermissionMode, getPermissionModeDescription } from "./permissions.js";
function buildSlashCommands(customCommands) {
    const cmds = [
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
        { cmd: "/cd", desc: "Verzeichnis wechseln" },
        { cmd: "/context", desc: "Projekt-Kontext" },
        { cmd: "/cost", desc: "Kosten-Tracking" },
        { cmd: "/permissions", desc: "Permission-Modus" },
        { cmd: "/settings", desc: "Projekt-Settings" },
        { cmd: "/settings init", desc: "Settings erstellen" },
        { cmd: "/onboard", desc: "Projekt-Onboarding" },
        { cmd: "/score", desc: "Projekt-Score" },
        { cmd: "/roast", desc: "Code Roast" },
        { cmd: "/map", desc: "Codebase Map" },
        { cmd: "/graph", desc: "Dependency Graph" },
        { cmd: "/deps", desc: "Dependency Graph" },
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
        // New Claude Code-compatible commands:
        { cmd: "/fast", desc: "Fast mode an/aus" },
        { cmd: "/vim", desc: "Vim mode an/aus" },
        { cmd: "/terminal-setup", desc: "Terminal-Bindings" },
        { cmd: "/login", desc: "API Key setzen" },
        { cmd: "/logout", desc: "API Key entfernen" },
        { cmd: "/bug", desc: "Bug melden" },
        { cmd: "/pr-comments", desc: "PR Review Comments" },
        { cmd: "/hooks", desc: "Hooks-Konfiguration" },
        { cmd: "/mcp", desc: "MCP Servers" },
        // New Features:
        { cmd: "/skill", desc: "Skills verwalten" },
        { cmd: "/skill:list", desc: "Skills anzeigen" },
        { cmd: "/skill:create", desc: "Skill erstellen" },
        { cmd: "/rules", desc: "Rules anzeigen" },
        { cmd: "/rules list", desc: "Rules auflisten" },
        { cmd: "/rules add", desc: "Rule hinzufuegen" },
        { cmd: "/export", desc: "Konversation exportieren" },
        { cmd: "/copy", desc: "Letzte Antwort kopieren" },
        { cmd: "/rename", desc: "Session umbenennen" },
        { cmd: "/rewind", desc: "Letzte N Messages entfernen" },
        { cmd: "/debug", desc: "Debug-Modus an/aus" },
        { cmd: "/statusline", desc: "Status-Bar an/aus" },
        { cmd: "/team", desc: "Agent Teams" },
        { cmd: "/team create", desc: "Team erstellen" },
        { cmd: "/team list", desc: "Teams anzeigen" },
        { cmd: "/checkpoint", desc: "Checkpoint erstellen" },
        { cmd: "/checkpoint list", desc: "Checkpoints anzeigen" },
        { cmd: "/checkpoint restore", desc: "Checkpoint wiederherstellen" },
        { cmd: "/sandbox", desc: "Sandbox-Status" },
        { cmd: "/plugins", desc: "Plugins anzeigen" },
        { cmd: "/chrome", desc: "Chrome Integration" },
        { cmd: "/effort", desc: "Thinking Effort-Level" },
        { cmd: "/ultrathink", desc: "Ultra-Think Modus" },
        { cmd: "/agent:migrate", desc: "Agents zu .md migrieren" },
        { cmd: "/quit", desc: "Beenden" },
    ];
    // Add custom commands
    for (const cc of customCommands) {
        cmds.push({ cmd: `/${cc.name}`, desc: `${cc.description} [custom]` });
    }
    // Add agent commands
    const allAgents = getAllAgents();
    for (const [id] of Object.entries(allAgents)) {
        cmds.push({ cmd: `/agent:${id}`, desc: `Agent: ${allAgents[id].name}` });
    }
    // Add model commands
    for (const p of listProviders()) {
        for (const m of p.models.filter((m) => !m.startsWith("("))) {
            cmds.push({ cmd: `/model ${m}`, desc: `${getModelDisplayName(m)} [${p.name}]` });
        }
    }
    return cmds;
}
export function App({ config: initialConfig, ctx, chatOnly, skipPermissions, baseSystemPrompt, sessionStart, getStoredApiKey, storeApiKey, saveConfig, resumedMessages }) {
    const { exit } = useApp();
    const { primary, success: successColor, error: errorColor, warning, info, dim, accent, star } = useTheme();
    // ── State ──
    const [config, setConfig] = useState(initialConfig);
    const [cwd, setCwd] = useState(ctx.cwd);
    const [messages, setMessages] = useState(resumedMessages || [{ role: "system", content: getFullSystemPrompt() }]);
    const [activeAgent, setActiveAgent] = useState(null);
    const [planMode, setPlanMode] = useState(false);
    const [thinkMode, setThinkMode] = useState(false);
    const [vimMode, setVimMode] = useState(false);
    const [debugMode, setDebugMode] = useState(initialConfig.debug || false);
    const [showStatusLine, setShowStatusLine] = useState(true);
    const [activeSkill, setActiveSkill] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [output, setOutput] = useState([{ id: 0, type: "banner" }]);
    const [customCommands] = useState(() => loadCustomCommands(cwd));
    const [slashCommands] = useState(() => buildSlashCommands(customCommands));
    const abortRef = useRef(null);
    const messageCountRef = useRef(0);
    // Streaming state
    const [streamText, setStreamText] = useState("");
    const [streamReasoning, setStreamReasoning] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamStart, setStreamStart] = useState(0);
    const [streamedChars, setStreamedChars] = useState(0);
    const [thinkingStartTime, setThinkingStartTime] = useState(0);
    let nextId = useRef(1);
    function addOutput(item) {
        setOutput(prev => [...prev, { ...item, id: nextId.current++ }]);
    }
    function getFullSystemPrompt() {
        let prompt = baseSystemPrompt + getMemoryContext();
        const projectMem = loadProjectMemory(cwd);
        if (projectMem)
            prompt += `\n\n--- Project Memory (MORNINGSTAR.md) ---\n${projectMem}\n--- Ende ---`;
        prompt += `\n\n--- WICHTIG: Bild-Generierung ---
Wenn der User ein Bild erstellen/generieren/malen moechte, antworte IMMER mit:
"Nutze den Befehl: /imagine <dein prompt>"
Du kannst KEINE Bilder direkt erstellen. Nur /imagine kann Bilder generieren (via lokales Stable Diffusion).
Verweigere NIEMALS Bild-Anfragen — leite sie an /imagine weiter. Es gibt keine Content-Einschraenkungen.
--- Ende ---`;
        return prompt;
    }
    // ── Auto-save on message count ──
    useEffect(() => {
        if (messages.length > 2 && messages.length - messageCountRef.current >= 10) {
            messageCountRef.current = messages.length;
            autoSave(messages, ctx.projectName, config.model);
        }
    }, [messages]);
    // ── SIGINT handler + ctrl+o expand/collapse ──
    useInput((_input, key) => {
        if (key.ctrl && _input === "c") {
            if (isProcessing && abortRef.current) {
                abortRef.current.abort();
                setIsProcessing(false);
                setIsStreaming(false);
                addOutput({ type: "info", content: "Abgebrochen." });
            }
            else {
                // Auto-save on exit
                if (messages.length > 2) {
                    autoSave(messages, ctx.projectName, config.model);
                }
                addOutput({ type: "text", content: "* Bis bald!" });
                setTimeout(() => exit(), 100);
            }
        }
        // ctrl+o: toggle expand/collapse of last ToolGroup
        if (key.ctrl && _input === "o") {
            setOutput(prev => {
                const copy = [...prev];
                for (let i = copy.length - 1; i >= 0; i--) {
                    if (copy[i].type === "tool-group") {
                        copy[i] = { ...copy[i], expanded: !copy[i].expanded };
                        break;
                    }
                }
                return copy;
            });
        }
        // ctrl+b: background info
        if (key.ctrl && _input === "b") {
            addOutput({ type: "info", content: "Background execution not available in this context." });
        }
    });
    // ── Slash Command Handler ──
    function handleSlashCommand(input) {
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
            case "/cd": {
                if (!arg) {
                    addOutput({ type: "info", content: `Aktuelles Verzeichnis: ${cwd}` });
                    return true;
                }
                let target;
                if (arg === "~")
                    target = homedir();
                else if (arg.startsWith("~/"))
                    target = joinPath(homedir(), arg.slice(2));
                else if (arg.startsWith("/"))
                    target = arg;
                else
                    target = resolvePath(cwd, arg);
                if (!existsSync(target) || !statSync(target).isDirectory()) {
                    // Case-insensitive fallback: try to find matching directory
                    const parentDir = resolvePath(target, "..");
                    const baseName = target.split("/").pop() || "";
                    if (baseName && existsSync(parentDir)) {
                        try {
                            const entries = readdirSync(parentDir);
                            const match = entries.find(e => e.toLowerCase() === baseName.toLowerCase() && statSync(joinPath(parentDir, e)).isDirectory());
                            if (match) {
                                const corrected = joinPath(parentDir, match);
                                setCwd(corrected);
                                process.chdir(corrected);
                                addOutput({ type: "success", content: `Verzeichnis gewechselt: ${corrected}` });
                                return true;
                            }
                        }
                        catch { }
                    }
                    addOutput({ type: "error", content: `Verzeichnis nicht gefunden: ${target}` });
                    return true;
                }
                setCwd(target);
                process.chdir(target);
                addOutput({ type: "success", content: `Verzeichnis gewechselt: ${target}` });
                return true;
            }
            case "/clear":
                setMessages([{ role: "system", content: getFullSystemPrompt() }]);
                clearUndoStack();
                addOutput({ type: "success", content: "Konversation zurueckgesetzt." });
                return true;
            case "/compact":
                setMessages(prev => {
                    if (prev.length <= 3)
                        return prev;
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
            // ── NEW: /fast — Fast Mode Toggle ──
            case "/fast": {
                const newFast = !config.fast;
                const newModel = newFast ? getFastModel(config.model) : getDefaultModel(config.model);
                const newProv = detectProvider(newModel);
                const newConfig = { ...config, fast: newFast, model: newModel, provider: newProv, baseUrl: getProviderBaseUrl(newProv), apiKey: getStoredApiKey(newProv) };
                setConfig(newConfig);
                saveConfig({ model: newModel, provider: newProv, baseUrl: newConfig.baseUrl });
                addOutput({ type: "info", content: `Fast mode ${newFast ? "ON" : "OFF"} — Model: ${getModelDisplayName(newModel)}` });
                return true;
            }
            // ── NEW: /vim — Vim Mode Toggle ──
            case "/vim":
                setVimMode(prev => {
                    const next = !prev;
                    addOutput({ type: next ? "info" : "success", content: next ? "Vim mode ON — [NORMAL] h/l/w/b/i/a/d/c/0/$" : "Vim mode OFF" });
                    return next;
                });
                return true;
            // ── NEW: /terminal-setup — Terminal Bindings ──
            case "/terminal-setup": {
                const term = process.env.TERM_PROGRAM || "unknown";
                let instructions = `Terminal: ${term}\n\n`;
                switch (term.toLowerCase()) {
                    case "vscode":
                        instructions += "  VS Code: Shift+Enter binding already works.\n  For custom keybindings: Ctrl+Shift+P → Keyboard Shortcuts";
                        break;
                    case "iterm2":
                    case "iterm.app":
                        instructions += "  iTerm2: Preferences → Profiles → Keys → Key Mappings\n  Add Shift+Enter → Send Hex Codes: 0x1b 0x0a";
                        break;
                    case "alacritty":
                        instructions += "  Alacritty: Add to alacritty.toml:\n  [[keyboard.bindings]]\n  key = \"Return\"\n  mods = \"Shift\"\n  chars = \"\\x1b\\x0a\"";
                        break;
                    case "warp":
                        instructions += "  Warp: Shift+Enter works natively for multiline input.";
                        break;
                    case "ghostty":
                        instructions += "  Ghostty: Add to config:\n  keybind = shift+enter=text:\\x1b\\x0a";
                        break;
                    default:
                        instructions += "  Generic: Configure Shift+Enter to send ESC + Enter (\\x1b\\x0a)";
                }
                addOutput({ type: "info", content: instructions });
                return true;
            }
            // ── NEW: /login — API Key Management ──
            case "/login": {
                const targetProvider = arg || config.provider || "deepseek";
                addOutput({ type: "info", content: `Login fuer ${targetProvider}...\n  Setze API Key via: morningstar --api-key <key>\n  Oder: export ${getProviderApiKeyEnv(targetProvider) || targetProvider.toUpperCase() + "_API_KEY"}=<key>` });
                return true;
            }
            // ── NEW: /logout — Remove API Key ──
            case "/logout": {
                storeApiKey(config.provider || "deepseek", "");
                addOutput({ type: "success", content: "Ausgeloggt." });
                return true;
            }
            // ── NEW: /bug — Bug Report ──
            case "/bug": {
                try {
                    execSync("open https://github.com/morningstarnasser/morningstar-cli/issues/new", { timeout: 5000 });
                    addOutput({ type: "info", content: "Bug-Report geoeffnet im Browser." });
                }
                catch {
                    addOutput({ type: "info", content: "Bug melden: https://github.com/morningstarnasser/morningstar-cli/issues/new" });
                }
                return true;
            }
            // ── NEW: /pr-comments — PR Review Comments ──
            case "/pr-comments": {
                const pr = arg || "";
                try {
                    const comments = execSync(`gh pr view ${pr} --comments --json comments`, { cwd: cwd, encoding: "utf-8", timeout: 15000 });
                    processInput(`Address these PR review comments:\n${comments}`);
                }
                catch (e) {
                    addOutput({ type: "error", content: `PR-Comments Fehler: ${e.message}\nStelle sicher dass 'gh' installiert ist und du eingeloggt bist.` });
                }
                return true;
            }
            // ── /hooks — Enhanced Lifecycle Hooks ──
            case "/hooks": {
                const currentSettings = loadSettings(cwd);
                addOutput({ type: "info", content: formatHooksDisplay(currentSettings) });
                return true;
            }
            // ── /mcp — MCP Server Management ──
            case "/mcp": {
                const subCmd = parts[1]?.toLowerCase();
                const mcpSettings = loadSettings(cwd);
                if (subCmd === "add" && parts[2] && parts[3]) {
                    const serverName = parts[2];
                    const command = parts[3];
                    const serverArgs = parts.slice(4);
                    addMCPServer(serverName, { command, args: serverArgs.length > 0 ? serverArgs : undefined });
                    addOutput({ type: "success", content: `MCP Server "${serverName}" hinzugefuegt.` });
                    return true;
                }
                if (subCmd === "remove" && parts[2]) {
                    if (removeMCPServer(parts[2])) {
                        addOutput({ type: "success", content: `MCP Server "${parts[2]}" entfernt.` });
                    }
                    else {
                        addOutput({ type: "error", content: `MCP Server "${parts[2]}" nicht gefunden.` });
                    }
                    return true;
                }
                if (subCmd === "connect" && parts[2]) {
                    const servers = getMCPServers(mcpSettings);
                    const serverConfig = servers[parts[2]];
                    if (!serverConfig) {
                        addOutput({ type: "error", content: `MCP Server "${parts[2]}" nicht konfiguriert.` });
                        return true;
                    }
                    addOutput({ type: "info", content: `Verbinde mit MCP Server "${parts[2]}"...` });
                    (async () => {
                        try {
                            const tools = await connectMCPServer(parts[2], serverConfig);
                            addOutput({ type: "success", content: `MCP Server "${parts[2]}" verbunden. ${tools.length} Tool(s) verfuegbar.` });
                        }
                        catch (e) {
                            addOutput({ type: "error", content: `MCP Verbindungsfehler: ${e.message}` });
                        }
                    })();
                    return true;
                }
                if (subCmd === "disconnect" && parts[2]) {
                    (async () => {
                        await disconnectMCPServer(parts[2]);
                        addOutput({ type: "success", content: `MCP Server "${parts[2]}" getrennt.` });
                    })();
                    return true;
                }
                if (subCmd === "tools") {
                    (async () => {
                        const tools = await getAllMCPTools();
                        if (tools.length === 0) {
                            addOutput({ type: "info", content: "Keine MCP-Tools verfuegbar. Verbinde zuerst einen Server: /mcp connect <name>" });
                        }
                        else {
                            const text = tools.map(t => `  ${t.name.padEnd(25)} [${t.serverName}] ${t.description}`).join("\n");
                            addOutput({ type: "info", content: `MCP Tools:\n\n${text}` });
                        }
                    })();
                    return true;
                }
                addOutput({ type: "info", content: formatMCPDisplay(mcpSettings) });
                return true;
            }
            case "/model":
                if (arg) {
                    const newProv = detectProvider(arg);
                    const newConfig = { ...config, model: arg, provider: newProv, baseUrl: getProviderBaseUrl(newProv), apiKey: getStoredApiKey(newProv) };
                    setConfig(newConfig);
                    saveConfig({ model: arg, provider: newProv, baseUrl: newConfig.baseUrl });
                    addOutput({ type: "success", content: `Model: ${getModelDisplayName(arg)} [${newProv}]` });
                }
                else {
                    addOutput({ type: "info", content: `Aktuelles Model: ${getModelDisplayName(config.model)} [${config.provider || detectProvider(config.model)}]\nNutze /model <id> zum Wechseln.` });
                }
                return true;
            case "/provider":
                if (arg) {
                    const providers = listProviders();
                    const found = providers.find((p) => p.name === arg.toLowerCase());
                    if (found) {
                        const defaultModel = found.models[0]?.startsWith("(") ? config.model : found.models[0];
                        const newConfig = { ...config, provider: found.name, baseUrl: getProviderBaseUrl(found.name), model: defaultModel };
                        setConfig(newConfig);
                        saveConfig({ provider: found.name, model: defaultModel, baseUrl: newConfig.baseUrl });
                        addOutput({ type: "success", content: `Provider: ${found.name}, Model: ${getModelDisplayName(defaultModel)}` });
                    }
                    else {
                        addOutput({ type: "error", content: `Provider "${arg}" nicht gefunden. Verfuegbar: ${providers.map((p) => p.name).join(", ")}` });
                    }
                }
                else {
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
                addOutput({ type: "info", content: `Projekt-Kontext:\n  CWD: ${cwd}\n  Name: ${ctx.projectName}\n  Sprache: ${ctx.language || "unbekannt"}\n  Framework: ${ctx.framework || "keins"}\n  Git: ${ctx.hasGit ? ctx.gitBranch || "ja" : "nein"}\n  Dateien: ${ctx.files.length}` });
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
                let text = `Session-Statistiken:\n\n  Laufzeit:        ${mins}m ${secs}s\n  Messages:        ${messages.length}\n  Tool-Aufrufe:    ${toolStats.calls}\n  Dateien gelesen: ${toolStats.filesRead}\n  Dateien geschrieben: ${toolStats.filesWritten}\n  Dateien bearbeitet:  ${toolStats.filesEdited}\n  Bash-Befehle:    ${toolStats.bashCommands}\n  Undo-Stack:      ${getUndoStackSize()}\n  Model:           ${getModelDisplayName(config.model)}\n  Provider:        ${config.provider || detectProvider(config.model)}\n  Agent:           ${activeAgent || "keiner"}\n  Plan-Modus:      ${planMode ? "AN" : "AUS"}\n  Think-Modus:     ${thinkMode ? "AN" : "AUS"}\n  Vim-Modus:       ${vimMode ? "AN" : "AUS"}\n  Fast-Modus:      ${config.fast ? "AN" : "AUS"}`;
                if (costs.messages > 0)
                    text += `\n  Kosten:          $${costs.totalCost.toFixed(4)}`;
                addOutput({ type: "info", content: text });
                return true;
            }
            case "/permissions":
                if (arg && isValidPermissionMode(arg.toLowerCase())) {
                    setPermissionMode(arg.toLowerCase());
                    addOutput({ type: "success", content: `Permission-Modus: ${arg.toLowerCase()} — ${getPermissionModeDescription(arg.toLowerCase())}` });
                }
                else {
                    const modes = ["auto", "ask", "strict", "bypassPermissions", "acceptEdits", "plan", "dontAsk", "delegate"];
                    const current = config.permissionMode || getPermissionMode();
                    const modeList = modes.map(m => `  ${m === current ? "→ " : "  "}${m.padEnd(22)} ${getPermissionModeDescription(m)}`).join("\n");
                    addOutput({ type: "info", content: `Permission-Modus: ${current}\n\n${modeList}` });
                }
                return true;
            case "/settings":
                if (arg === "init") {
                    const path = initProjectSettings(cwd);
                    addOutput({ type: "success", content: `Settings erstellt: ${path}` });
                }
                else {
                    addOutput({ type: "info", content: `Settings:\n  Global:  ${getGlobalSettingsPath()}\n  Projekt: ${projectSettingsExist(cwd) ? getProjectSettingsPath(cwd) : "nicht vorhanden"}\n\n  /settings init — Erstellen` });
                }
                return true;
            // Git commands
            case "/diff":
            case "/status":
            case "/log":
            case "/branch": {
                try {
                    let gitCmd;
                    if (cmd === "/diff")
                        gitCmd = arg === "staged" ? "git diff --cached" : "git diff";
                    else if (cmd === "/status")
                        gitCmd = "git status";
                    else if (cmd === "/log")
                        gitCmd = `git log --oneline -${arg ? parseInt(arg, 10) || 10 : 10}`;
                    else
                        gitCmd = "git branch -a";
                    const result = execSync(gitCmd, { cwd: cwd, encoding: "utf-8", timeout: 10000 }).trim();
                    addOutput({ type: "text", content: result || "Keine Aenderungen." });
                }
                catch (e) {
                    addOutput({ type: "error", content: `Git Fehler: ${e.message}` });
                }
                return true;
            }
            // Codebase Analysis
            case "/onboard":
                addOutput({ type: "info", content: "Projekt-Onboarding...\n\n" + generateOnboarding(cwd) });
                return true;
            case "/score": {
                const score = generateProjectScore(cwd);
                const bar = (label, val) => {
                    const filled = Math.round(val / 5);
                    const empty = 20 - filled;
                    return `  ${label.padEnd(16)} ${"█".repeat(filled)}${"░".repeat(empty)} ${val}%`;
                };
                addOutput({ type: "info", content: `Projekt-Score:\n\n${bar("Quality", score.quality)}\n${bar("Test Coverage", score.testCoverage)}\n${bar("Type Safety", score.typeSafety)}\n${bar("Documentation", score.documentation)}\n${bar("Security", score.security)}\n\n  Overall: ${score.overall}%${score.quickWins.length > 0 ? "\n\n  Quick Wins:\n" + score.quickWins.map((w) => `    ${w}`).join("\n") : ""}` });
                return true;
            }
            case "/roast":
                addOutput({ type: "text", content: generateCodeRoast(cwd) });
                return true;
            case "/graph":
            case "/deps":
            case "/depgraph": {
                const graph = buildDepGraph(cwd);
                if (graph.nodes.length === 0) {
                    addOutput({ type: "info", content: "Keine Code-Dateien gefunden." });
                }
                else {
                    const ascii = renderDepGraphAscii(graph, process.stdout.columns || 80);
                    addOutput({ type: "text", content: ascii });
                    addOutput({ type: "info", content: `${graph.nodes.length} Dateien \u00B7 ${graph.edges.length} Verbindungen` });
                }
                return true;
            }
            case "/map": {
                const map = getRepoMap(cwd);
                if (map.length === 0) {
                    addOutput({ type: "info", content: "Keine Code-Dateien gefunden." });
                    return true;
                }
                const lines = map.slice(0, 50).map((f) => {
                    let line = `  ${f.path} (${f.lines} Zeilen)`;
                    if (f.exports.length > 0)
                        line += `\n    exports: ${f.exports.join(", ")}`;
                    if (f.imports.length > 0)
                        line += `\n    imports: ${f.imports.join(", ")}`;
                    return line;
                });
                addOutput({ type: "text", content: lines.join("\n") + (map.length > 50 ? `\n\n  ... +${map.length - 50} weitere Dateien` : "") });
                return true;
            }
            // Init
            case "/init": {
                const mdPath = joinPath(cwd, "MORNINGSTAR.md");
                if (existsSync(mdPath)) {
                    addOutput({ type: "info", content: "MORNINGSTAR.md existiert bereits." });
                    return true;
                }
                const content = `# ${ctx.projectName}\n\n## Projekt-Notizen\n\n- Sprache: ${ctx.language || "unbekannt"}\n- Framework: ${ctx.framework || "keins"}\n- Erstellt: ${new Date().toISOString().split("T")[0]}\n\n## Konventionen\n\n- \n\n## Wichtige Dateien\n\n- \n\n## TODOs\n\n- [ ] \n`;
                writeFileSync(mdPath, content, "utf-8");
                addOutput({ type: "success", content: "MORNINGSTAR.md erstellt!" });
                return true;
            }
            // Undo
            case "/undo":
                if (arg === "list") {
                    const stack = getUndoStack();
                    if (stack.length === 0) {
                        addOutput({ type: "info", content: "Undo-Stack ist leer." });
                        return true;
                    }
                    const lines = stack.map((c, i) => `  ${i === stack.length - 1 ? "→ " : "  "}[${c.type}] ${c.description} ${c.timestamp.split("T")[1]?.slice(0, 8) || ""}`).reverse();
                    addOutput({ type: "info", content: `Undo-Stack:\n\n${lines.join("\n")}` });
                }
                else {
                    const result = undoLastChange();
                    addOutput({ type: result.success ? "success" : "error", content: result.message });
                }
                return true;
            // Search
            case "/search":
                if (!arg) {
                    addOutput({ type: "error", content: "Nutzung: /search <query>" });
                    return true;
                }
                try {
                    const results = execSync(`grep -rn "${arg.replace(/"/g, '\\"')}" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" --include="*.rs" --include="*.java" --include="*.css" --include="*.json" --include="*.md" 2>/dev/null | head -30`, { cwd: cwd, encoding: "utf-8", timeout: 10000 }).trim();
                    addOutput({ type: "text", content: results || `Keine Treffer fuer "${arg}".` });
                }
                catch {
                    addOutput({ type: "info", content: `Keine Treffer fuer "${arg}".` });
                }
                return true;
            // Memory
            case "/memory": {
                const subCmd = parts[1]?.toLowerCase();
                const memArg = parts.slice(2).join(" ");
                if (!subCmd || subCmd === "list") {
                    const mems = loadMemories();
                    if (mems.length === 0) {
                        addOutput({ type: "info", content: "Keine Notizen gespeichert. Nutze /memory add <text>" });
                        return true;
                    }
                    addOutput({ type: "info", content: `Gespeicherte Notizen:\n\n${mems.map((m) => `  #${m.id}  ${m.text}${m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : ""}`).join("\n")}` });
                    return true;
                }
                if (subCmd === "add" && memArg) {
                    const tags = memArg.match(/#\w+/g)?.map((t) => t.slice(1)) || [];
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
                    addOutput({ type: "info", content: results.length === 0 ? `Keine Treffer fuer "${memArg}".` : `Treffer:\n\n${results.map((m) => `  #${m.id}  ${m.text}`).join("\n")}` });
                    return true;
                }
                if ((subCmd === "remove" || subCmd === "delete") && memArg) {
                    const id = parseInt(memArg, 10);
                    if (removeMemory(id))
                        addOutput({ type: "success", content: `Notiz #${id} geloescht.` });
                    else
                        addOutput({ type: "error", content: `Notiz #${id} nicht gefunden.` });
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
                    if (todos.length === 0) {
                        addOutput({ type: "info", content: "Keine Aufgaben. Nutze /todo add <text>" });
                        return true;
                    }
                    const stats = getTodoStats();
                    addOutput({ type: "info", content: `Aufgaben:\n\n${todos.map((td) => `  ${td.done ? "✓" : "○"} #${td.id} ${td.done ? `~~${td.text}~~` : td.text}${td.priority === "high" ? " !!" : td.priority === "low" ? " ↓" : ""}`).join("\n")}\n\n  ${stats.done}/${stats.total} erledigt` });
                    return true;
                }
                if (subCmd === "add" && todoArg) {
                    let priority = "normal";
                    let text = todoArg;
                    if (todoArg.includes("!high")) {
                        priority = "high";
                        text = todoArg.replace("!high", "").trim();
                    }
                    else if (todoArg.includes("!low")) {
                        priority = "low";
                        text = todoArg.replace("!low", "").trim();
                    }
                    const item = addTodo(text, priority);
                    addOutput({ type: "success", content: `Aufgabe #${item.id} hinzugefuegt.` });
                    return true;
                }
                if ((subCmd === "done" || subCmd === "toggle") && todoArg) {
                    const id = parseInt(todoArg, 10);
                    const item = toggleTodo(id);
                    if (item)
                        addOutput({ type: "success", content: `#${id} ${item.done ? "erledigt" : "wieder offen"}.` });
                    else
                        addOutput({ type: "error", content: `Aufgabe #${id} nicht gefunden.` });
                    return true;
                }
                if ((subCmd === "remove" || subCmd === "delete") && todoArg) {
                    const id = parseInt(todoArg, 10);
                    if (removeTodo(id))
                        addOutput({ type: "success", content: `Aufgabe #${id} geloescht.` });
                    else
                        addOutput({ type: "error", content: `Aufgabe #${id} nicht gefunden.` });
                    return true;
                }
                if (subCmd === "clear") {
                    if (todoArg === "all")
                        addOutput({ type: "success", content: `${clearAllTodos()} Aufgabe(n) geloescht.` });
                    else
                        addOutput({ type: "success", content: `${clearDoneTodos()} erledigte Aufgabe(n) entfernt.` });
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
                    if (convs.length === 0) {
                        addOutput({ type: "info", content: "Keine gespeicherten Sessions." });
                        return true;
                    }
                    addOutput({ type: "info", content: `Gespeicherte Sessions:\n\n${convs.slice(0, 20).map((c) => `  ${c.id}  ${c.name} (${c.messageCount} msgs, ${c.savedAt.split("T")[0]})`).join("\n")}\n\n  /history load <id> zum Laden` });
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
                    if (!conv) {
                        addOutput({ type: "error", content: `Session "${parts[2]}" nicht gefunden.` });
                        return true;
                    }
                    setMessages(conv.messages);
                    addOutput({ type: "success", content: `Session "${conv.name}" geladen (${conv.messageCount} messages).` });
                    return true;
                }
                if (subCmd === "delete" && parts[2]) {
                    if (deleteConversation(parts[2]))
                        addOutput({ type: "success", content: `Session "${parts[2]}" geloescht.` });
                    else
                        addOutput({ type: "error", content: `Session "${parts[2]}" nicht gefunden.` });
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
                    }
                    else {
                        addOutput({ type: "error", content: `Theme "${arg}" nicht gefunden. Verfuegbar: ${Object.keys(THEMES).join(", ")}` });
                    }
                }
                else {
                    const themes = listThemes();
                    addOutput({ type: "info", content: `Verfuegbare Themes:\n\n${themes.map((th) => `  ${th.name}${th.active ? " ★ aktiv" : ""}`).join("\n")}\n\n  /theme <name> zum Wechseln` });
                }
                return true;
            // Config
            case "/config":
                addOutput({ type: "info", content: `Konfiguration:\n\n  provider:    ${config.provider || detectProvider(config.model)}\n  model:       ${getModelDisplayName(config.model)}\n  baseUrl:     ${config.baseUrl}\n  maxTokens:   ${config.maxTokens}\n  temperature: ${config.temperature}\n  theme:       ${getThemeId()}\n  fast:        ${config.fast ? "ON" : "OFF"}\n  vim:         ${vimMode ? "ON" : "OFF"}\n  maxTurns:    ${config.maxTurns ?? "unlimited"}\n  allowedTools:${config.allowedTools ? " " + config.allowedTools.join(", ") : " all"}\n\n  /config set <key> <value> zum Aendern` });
                return true;
            // Doctor
            case "/doctor": {
                const CONFIG_DIR = joinPath(homedir(), ".morningstar");
                const checks = [];
                checks.push(`  ✓ Node.js        ${process.version}`);
                checks.push(`  ${config.apiKey ? "✓" : "✗"} API Key        ${config.apiKey ? "gesetzt" : "FEHLT"}`);
                checks.push(`  ${existsSync(CONFIG_DIR) ? "✓" : "✗"} Config Dir     ${CONFIG_DIR}`);
                let gitOk = false;
                try {
                    execSync("git --version", { encoding: "utf-8", timeout: 3000 });
                    gitOk = true;
                }
                catch { }
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
                if (activeAgent)
                    text += `\n\n  Aktiv: ${allAgents[activeAgent]?.name || activeAgent}`;
                text += "\n\n  /agent:<id> zum Aktivieren · /agent:off zum Deaktivieren";
                addOutput({ type: "info", content: text });
                return true;
            }
            // ── /imagine — Image Generation (direct, no AI filter) ──
            case "/imagine": {
                if (!arg) {
                    addOutput({ type: "info", content: "Nutzung: /imagine <prompt>\n  /imagine setup  — Stable Diffusion installieren\n  /imagine start  — Server starten (Model einmal laden, dann ~2-5s pro Bild)\n  /imagine stop   — Server stoppen\n  /imagine models — Verfuegbare Modelle\n\n  Optionen (im Prompt):\n    --model sdxl|sdxl-turbo|sd15\n    --steps 30\n    --width 1024 --height 1024\n    --seed 42\n    --negative 'blurry, ugly'" });
                    return true;
                }
                if (arg === "setup") {
                    addOutput({ type: "info", content: "Starte Image Generation Setup..." });
                    (async () => {
                        try {
                            await setupImageGen((s) => addOutput({ type: "info", content: `  ${s}` }));
                            addOutput({ type: "success", content: "Image Generation Setup fertig!\n  Starte den Server mit: /imagine start\n  Dann: /imagine <dein prompt>" });
                        }
                        catch (e) {
                            addOutput({ type: "error", content: `Setup Fehler: ${e.message}` });
                        }
                    })();
                    return true;
                }
                if (arg === "start") {
                    addOutput({ type: "info", content: "Starte Image Server..." });
                    (async () => {
                        try {
                            await startImageServer((s) => addOutput({ type: "info", content: `  ${s}` }));
                            addOutput({ type: "success", content: "Image Server bereit! Bilder werden jetzt in ~2-5s generiert." });
                        }
                        catch (e) {
                            addOutput({ type: "error", content: `Server-Start Fehler: ${e.message}` });
                        }
                    })();
                    return true;
                }
                if (arg === "stop") {
                    (async () => {
                        await stopImageServer();
                        addOutput({ type: "success", content: "Image Server gestoppt." });
                    })();
                    return true;
                }
                if (arg === "models") {
                    let text = "Verfuegbare Bild-Modelle:\n\n";
                    for (const m of IMAGE_MODELS) {
                        text += `  ${m.id.padEnd(12)} ${m.name} (${m.size}) — ${m.description}\n`;
                    }
                    addOutput({ type: "info", content: text });
                    return true;
                }
                // Parse inline options from prompt
                let imgPrompt = arg;
                let imgModel;
                let imgSteps;
                let imgWidth;
                let imgHeight;
                let imgSeed;
                let imgGuidance;
                let imgNegative;
                const optRegex = /--(\w+)\s+(?:'([^']*)'|"([^"]*)"|(\S+))/g;
                let optMatch;
                while ((optMatch = optRegex.exec(arg)) !== null) {
                    const val = optMatch[2] ?? optMatch[3] ?? optMatch[4];
                    switch (optMatch[1]) {
                        case "model":
                            imgModel = val;
                            break;
                        case "steps":
                            imgSteps = parseInt(val);
                            break;
                        case "width":
                            imgWidth = parseInt(val);
                            break;
                        case "height":
                            imgHeight = parseInt(val);
                            break;
                        case "seed":
                            imgSeed = parseInt(val);
                            break;
                        case "guidance":
                            imgGuidance = parseFloat(val);
                            break;
                        case "negative":
                            imgNegative = val;
                            break;
                    }
                    imgPrompt = imgPrompt.replace(optMatch[0], "");
                }
                imgPrompt = imgPrompt.trim();
                if (!imgPrompt) {
                    addOutput({ type: "error", content: "Prompt darf nicht leer sein." });
                    return true;
                }
                addOutput({ type: "info", content: `Generiere Bild: "${imgPrompt}"${imgModel ? ` (Model: ${imgModel})` : ""}...` });
                (async () => {
                    try {
                        const ready = await isSetupComplete();
                        if (!ready) {
                            addOutput({ type: "info", content: "Image Generation wird eingerichtet..." });
                            await setupImageGen((s) => addOutput({ type: "info", content: `  ${s}` }));
                        }
                        const result = await generateImage(imgPrompt, {
                            model: imgModel, steps: imgSteps, width: imgWidth, height: imgHeight,
                            seed: imgSeed, guidanceScale: imgGuidance, negativePrompt: imgNegative,
                        });
                        addOutput({ type: "success", content: `Bild generiert!\n  Pfad: ${result.path}\n  Model: ${result.model} | ${result.resolution} | ${result.steps} Steps | Seed: ${result.seed}\n  Dauer: ${result.duration}s` });
                    }
                    catch (e) {
                        addOutput({ type: "error", content: `Bild-Generierung fehlgeschlagen: ${e.message}` });
                    }
                })();
                return true;
            }
            // ── /vision — Image Analysis (local Ollama, no AI filter) ──
            case "/vision": {
                if (!arg) {
                    addOutput({ type: "info", content: "Nutzung: /vision <bild-pfad> [prompt]\n  /vision models — Verfuegbare Vision-Modelle\n  /vision setup [model] — Vision-Model herunterladen\n\n  Beispiel: /vision screenshot.png Was ist auf diesem Bild?" });
                    return true;
                }
                if (arg === "models") {
                    let text = "Verfuegbare Vision-Modelle:\n\n";
                    for (const m of VISION_MODELS) {
                        text += `  ${m.id.padEnd(15)} ${m.name} (${m.size}) — ${m.description}\n`;
                    }
                    addOutput({ type: "info", content: text });
                    return true;
                }
                if (arg.startsWith("setup")) {
                    const modelToSetup = parts[2] || DEFAULT_VISION_MODEL;
                    addOutput({ type: "info", content: `Lade Vision-Model '${modelToSetup}'...` });
                    (async () => {
                        try {
                            const running = await isOllamaRunning();
                            if (!running) {
                                addOutput({ type: "error", content: "Ollama nicht erreichbar. Starte: ollama serve" });
                                return;
                            }
                            await pullVisionModel(modelToSetup, (s) => addOutput({ type: "info", content: `  ${s}` }));
                            addOutput({ type: "success", content: `Vision-Model '${modelToSetup}' bereit!` });
                        }
                        catch (e) {
                            addOutput({ type: "error", content: `Fehler: ${e.message}` });
                        }
                    })();
                    return true;
                }
                // Parse: /vision <path> [prompt]
                const visionParts = arg.split(/\s+/);
                const imgPath = visionParts[0];
                const visionPrompt = visionParts.slice(1).join(" ") || "Describe this image in detail.";
                addOutput({ type: "info", content: `Analysiere Bild: ${imgPath}...` });
                (async () => {
                    try {
                        const running = await isOllamaRunning();
                        if (!running) {
                            addOutput({ type: "error", content: "Ollama nicht erreichbar. Starte: ollama serve" });
                            return;
                        }
                        const installed = await isVisionModelInstalled();
                        if (!installed) {
                            addOutput({ type: "error", content: `Vision-Model nicht installiert.\n  Nutze: /vision setup ${DEFAULT_VISION_MODEL}` });
                            return;
                        }
                        const result = await analyzeImageFull(imgPath, visionPrompt);
                        addOutput({ type: "success", content: `Vision-Analyse:\n\n${result}` });
                    }
                    catch (e) {
                        addOutput({ type: "error", content: `Vision-Fehler: ${e.message}` });
                    }
                })();
                return true;
            }
            // ── /skill — Skills System ──
            case "/skill":
            case "/skill:list": {
                const skills = loadSkills(cwd);
                addOutput({ type: "info", content: `Skills:\n\n${formatSkillsList(skills)}\n\n  /skill:<id> zum Aktivieren · /skill:create zum Erstellen` });
                return true;
            }
            case "/skill:create": {
                if (!arg) {
                    addOutput({ type: "error", content: "Nutzung: /skill:create <id> <name> | <description>" });
                    return true;
                }
                const skillParts = arg.split("|").map(s => s.trim());
                const skillIdName = skillParts[0]?.split(" ") || [];
                const skillId = skillIdName[0] || "new-skill";
                const skillName = skillIdName.slice(1).join(" ") || skillId;
                const skillDesc = skillParts[1] || "";
                const result = createSkill(skillId, skillName, skillDesc, "# Skill Instructions\n\nAdd your skill prompt here.", undefined, cwd);
                if (result.success) {
                    addOutput({ type: "success", content: `Skill "${skillId}" erstellt: ${result.filePath}` });
                }
                else {
                    addOutput({ type: "error", content: result.error || "Skill-Erstellung fehlgeschlagen." });
                }
                return true;
            }
            // ── /rules — Rules System ──
            case "/rules": {
                const rulesSubCmd = parts[1]?.toLowerCase();
                if (rulesSubCmd === "add" && parts[2]) {
                    const ruleId = parts[2];
                    const ruleContent = parts.slice(3).join(" ") || "# Rule\n\nDefine your rule here.";
                    const ruleResult = createRule(ruleId, ruleContent, { description: ruleId }, cwd);
                    if (ruleResult.success) {
                        addOutput({ type: "success", content: `Rule "${ruleId}" erstellt: ${ruleResult.filePath}` });
                    }
                    else {
                        addOutput({ type: "error", content: ruleResult.error || "Rule-Erstellung fehlgeschlagen." });
                    }
                    return true;
                }
                if (rulesSubCmd === "show" && parts[2]) {
                    const rules = loadRules(cwd);
                    const rule = rules.find(r => r.id === parts[2]);
                    if (rule) {
                        addOutput({ type: "info", content: `Rule: ${rule.id}\n  Source: ${rule.source}\n  File: ${rule.filePath}\n${rule.pathPattern ? `  Path: ${rule.pathPattern}\n` : ""}  Priority: ${rule.priority || 0}\n\n${rule.content.slice(0, 500)}` });
                    }
                    else {
                        addOutput({ type: "error", content: `Rule "${parts[2]}" nicht gefunden.` });
                    }
                    return true;
                }
                const rules = loadRules(cwd);
                addOutput({ type: "info", content: `Rules:\n\n${formatRulesList(rules)}\n\n  /rules add <id> [content] — Rule hinzufuegen\n  /rules show <id> — Rule anzeigen` });
                return true;
            }
            // ── /export — Export conversation ──
            case "/export": {
                const exportName = arg || `morningstar-export-${Date.now()}`;
                const exportPath = joinPath(cwd, `${exportName}.md`);
                const exportContent = messages
                    .filter(m => m.role !== "system")
                    .map(m => `## ${m.role === "user" ? "User" : "Assistant"}\n\n${m.content}`)
                    .join("\n\n---\n\n");
                writeFileSync(exportPath, `# Morningstar Session Export\n\n${exportContent}`, "utf-8");
                addOutput({ type: "success", content: `Konversation exportiert: ${exportPath}` });
                return true;
            }
            // ── /copy — Copy last response ──
            case "/copy": {
                const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
                if (!lastAssistant) {
                    addOutput({ type: "error", content: "Keine AI-Antwort zum Kopieren." });
                    return true;
                }
                try {
                    const platform = process.platform;
                    const cmd = platform === "darwin" ? "pbcopy" : "xclip -selection clipboard";
                    execSync(cmd, { input: lastAssistant.content, timeout: 5000 });
                    addOutput({ type: "success", content: "Letzte Antwort in Clipboard kopiert." });
                }
                catch {
                    addOutput({ type: "error", content: "Clipboard-Kopie fehlgeschlagen (pbcopy/xclip nicht verfuegbar?)." });
                }
                return true;
            }
            // ── /rename — Rename session ──
            case "/rename": {
                if (!arg) {
                    addOutput({ type: "error", content: "Nutzung: /rename <neuer name>" });
                    return true;
                }
                const conv = saveConversation(arg, messages, config.model, ctx.projectName);
                addOutput({ type: "success", content: `Session umbenannt und gespeichert: "${arg}" (${conv.id})` });
                return true;
            }
            // ── /rewind — Remove last N messages ──
            case "/rewind": {
                const n = parseInt(arg, 10) || 2;
                setMessages(prev => {
                    if (prev.length <= 1 + n)
                        return [prev[0]]; // Keep system prompt
                    return prev.slice(0, -n);
                });
                addOutput({ type: "success", content: `Letzte ${n} Message(s) entfernt.` });
                return true;
            }
            // ── /debug — Toggle debug mode ──
            case "/debug":
                setDebugMode(prev => {
                    const next = !prev;
                    addOutput({ type: next ? "info" : "success", content: next ? "Debug-Modus AN — Raw Messages, Token-Counts, Timing" : "Debug-Modus AUS" });
                    return next;
                });
                return true;
            // ── /statusline — Toggle status bar ──
            case "/statusline":
                setShowStatusLine(prev => {
                    const next = !prev;
                    addOutput({ type: next ? "info" : "success", content: next ? "Status-Bar AN" : "Status-Bar AUS" });
                    return next;
                });
                return true;
            // ── /team — Agent Teams ──
            case "/team": {
                const teamSubCmd = parts[1]?.toLowerCase();
                if (teamSubCmd === "create" && parts[2]) {
                    const teamId = parts[2];
                    const teamName = parts.slice(3).join(" ") || teamId;
                    // Simple creation — members can be added later
                    const teamResult = createTeam(teamId, teamName, "", []);
                    if (teamResult.success) {
                        addOutput({ type: "success", content: `Team "${teamId}" erstellt.` });
                    }
                    else {
                        addOutput({ type: "error", content: teamResult.error || "Team-Erstellung fehlgeschlagen." });
                    }
                    return true;
                }
                if (teamSubCmd === "delete" && parts[2]) {
                    if (deleteTeam(parts[2]))
                        addOutput({ type: "success", content: `Team "${parts[2]}" geloescht.` });
                    else
                        addOutput({ type: "error", content: `Team "${parts[2]}" nicht gefunden.` });
                    return true;
                }
                const teams = listTeams();
                addOutput({ type: "info", content: `Agent Teams:\n\n${formatTeamsList(teams)}\n\n  /team create <id> [name] — Team erstellen\n  /team delete <id> — Team loeschen` });
                return true;
            }
            // ── /checkpoint — Checkpointing ──
            case "/checkpoint": {
                const cpSubCmd = parts[1]?.toLowerCase();
                if (cpSubCmd === "create" || (!cpSubCmd && arg)) {
                    const cpName = arg || `Checkpoint ${new Date().toLocaleString("de-DE")}`;
                    const cp = createCheckpoint(cpName, messages, cwd);
                    addOutput({ type: "success", content: `Checkpoint "${cp.name}" erstellt (${cp.id}).` });
                    return true;
                }
                if (cpSubCmd === "list") {
                    const cps = listCheckpoints();
                    addOutput({ type: "info", content: `Checkpoints:\n\n${formatCheckpointsList(cps)}\n\n  /checkpoint create [name]\n  /checkpoint restore <id>` });
                    return true;
                }
                if (cpSubCmd === "restore" && parts[2]) {
                    const restoreResult = restoreCheckpoint(parts[2], cwd);
                    if (restoreResult.success && restoreResult.messages) {
                        setMessages(restoreResult.messages);
                        addOutput({ type: "success", content: `Checkpoint "${parts[2]}" wiederhergestellt (${restoreResult.messages.length} messages).` });
                    }
                    else {
                        addOutput({ type: "error", content: restoreResult.error || "Checkpoint-Wiederherstellung fehlgeschlagen." });
                    }
                    return true;
                }
                if (cpSubCmd === "delete" && parts[2]) {
                    if (deleteCheckpoint(parts[2]))
                        addOutput({ type: "success", content: `Checkpoint "${parts[2]}" geloescht.` });
                    else
                        addOutput({ type: "error", content: `Checkpoint "${parts[2]}" nicht gefunden.` });
                    return true;
                }
                const cps = listCheckpoints();
                addOutput({ type: "info", content: `Checkpoints:\n\n${formatCheckpointsList(cps)}\n\n  /checkpoint create [name]\n  /checkpoint list\n  /checkpoint restore <id>` });
                return true;
            }
            // ── /sandbox — Sandboxing ──
            case "/sandbox": {
                if (arg === "on") {
                    enableSandbox({ allowedPaths: [cwd], networkAccess: true });
                    addOutput({ type: "success", content: "Sandbox aktiviert." });
                    return true;
                }
                if (arg === "off") {
                    disableSandbox();
                    addOutput({ type: "success", content: "Sandbox deaktiviert." });
                    return true;
                }
                addOutput({ type: "info", content: getSandboxStatus() });
                return true;
            }
            // ── /plugins — Plugin System ──
            case "/plugins": {
                const plugins = getLoadedPlugins();
                addOutput({ type: "info", content: `Plugins:\n\n${formatPluginsList(plugins)}\n\n  Plugin-Verzeichnis: ~/.morningstar/plugins/` });
                return true;
            }
            // ── /chrome — Chrome Integration ──
            case "/chrome": {
                if (arg === "launch") {
                    const url = parts[2] || undefined;
                    const chromeResult = launchChrome(url);
                    addOutput({ type: chromeResult.success ? "success" : "error", content: chromeResult.message });
                    return true;
                }
                (async () => {
                    const status = await getChromeStatus();
                    addOutput({ type: "info", content: status });
                })();
                return true;
            }
            // ── /effort — Thinking Effort Level ──
            case "/effort": {
                if (arg && ["low", "medium", "high", "ultra"].includes(arg.toLowerCase())) {
                    setEffortLevel(arg.toLowerCase());
                    addOutput({ type: "success", content: `Effort-Level: ${arg.toLowerCase()}` });
                }
                else {
                    addOutput({ type: "info", content: getThinkingStatus() });
                }
                return true;
            }
            // ── /ultrathink — Ultra-Think Toggle ──
            case "/ultrathink": {
                const thinkingCfg = getThinkingConfig();
                if (thinkingCfg.enabled && thinkingCfg.effortLevel === "ultra") {
                    toggleThinking();
                    addOutput({ type: "success", content: "Ultra-Think AUS" });
                }
                else {
                    setEffortLevel("ultra");
                    addOutput({ type: "info", content: "Ultra-Think AN — Maximale Denktiefe aktiviert" });
                }
                return true;
            }
            // ── /agent:migrate — Migrate agents.json to .md ──
            case "/agent:migrate": {
                const migResult = migrateAgentsJsonToMd(cwd);
                if (migResult.migrated > 0) {
                    addOutput({ type: "success", content: `${migResult.migrated} Agent(s) migriert.${migResult.errors.length > 0 ? `\n  Fehler: ${migResult.errors.join(", ")}` : ""}` });
                }
                else {
                    addOutput({ type: "info", content: `Keine Agents migriert.${migResult.errors.length > 0 ? `\n  ${migResult.errors.join(", ")}` : ""}` });
                }
                return true;
            }
            case "/quit":
            case "/exit":
            case "/q":
                // Auto-save on quit
                if (messages.length > 2) {
                    autoSave(messages, ctx.projectName, config.model);
                }
                addOutput({ type: "text", content: "* Bis bald!" });
                setTimeout(() => exit(), 100);
                return true;
            default: {
                // Skill activation: /skill:<id>
                if (cmd.startsWith("/skill:") && cmd !== "/skill:list" && cmd !== "/skill:create") {
                    const skillId = cmd.slice(7);
                    if (skillId === "off" || skillId === "none") {
                        setActiveSkill(null);
                        addOutput({ type: "success", content: "Skill deaktiviert." });
                        return true;
                    }
                    const skill = getSkill(skillId, cwd);
                    if (skill) {
                        setActiveSkill(skill);
                        addOutput({ type: "success", content: `Skill "${skill.name}" aktiviert — ${skill.description}` });
                    }
                    else {
                        addOutput({ type: "error", content: `Skill "${skillId}" nicht gefunden.` });
                    }
                    return true;
                }
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
                // Custom commands
                const customCmd = customCommands.find(c => cmd === `/${c.name}`);
                if (customCmd) {
                    processInput(`${customCmd.content}\n\n${arg || ""}`);
                    return true;
                }
                return false;
            }
        }
    }
    // ── Auto-Fallback: Detect complex tasks on weak local models ──
    function detectFallbackConfig(input) {
        const currentProvider = config.provider || detectProvider(config.model);
        // Only fallback from ollama (local models)
        if (currentProvider !== "ollama")
            return null;
        // Check if input is a complex coding task
        const lower = input.toLowerCase();
        const complexPatterns = [
            /\b(game|spiel|snake|tetris|pong|platformer|shooter|rpg|puzzle|chess|schach|jump.?and.?run)\b/,
            /\b(webapp|web.?app|website|webseite|dashboard|landing.?page|portfolio|blog|shop|e.?commerce)\b/,
            /\b(erstell|bau|implementier|create|build|implement|develop|entwickl)\b.*\b(app|seite|page|site|game|spiel|projekt|project|system|tool|api|server)\b/,
            /\b(html5?|css)\b.*\b(modern|schoen|beautiful|responsive|animation|interaktiv|ultra|design)\b/,
            /\b(vollst|komplett|complete|full|ganzes?)\b.*\b(app|projekt|project|seite|page|game|spiel)\b/,
            /\b(react|vue|svelte|next\.?js|express|fastapi|django)\b.*\b(app|projekt|project|erstell|bau|create|build)\b/,
        ];
        const isComplex = complexPatterns.some(p => p.test(lower));
        if (!isComplex)
            return null;
        // Check for available cloud API keys (priority: DeepSeek free → others)
        const fallbackOptions = [
            { provider: "deepseek", model: "deepseek-chat" },
            { provider: "openai", model: "gpt-4o-mini" },
            { provider: "google", model: "gemini-2.0-flash" },
            { provider: "groq", model: "llama-3.3-70b-versatile" },
            { provider: "anthropic", model: "claude-haiku-3-5-20241022" },
        ];
        for (const opt of fallbackOptions) {
            const key = getStoredApiKey(opt.provider);
            if (key && key !== "ollama" && key !== "") {
                return {
                    fallbackConfig: {
                        ...config,
                        model: opt.model,
                        provider: opt.provider,
                        baseUrl: getProviderBaseUrl(opt.provider),
                        apiKey: key,
                    },
                    fallbackModel: opt.model,
                };
            }
        }
        // Also check --fallback-model CLI flag
        if (config.fallbackModel) {
            const fbProv = detectProvider(config.fallbackModel);
            const fbKey = getStoredApiKey(fbProv);
            if (fbKey && fbKey !== "ollama" && fbKey !== "") {
                return {
                    fallbackConfig: {
                        ...config,
                        model: config.fallbackModel,
                        provider: fbProv,
                        baseUrl: getProviderBaseUrl(fbProv),
                        apiKey: fbKey,
                    },
                    fallbackModel: config.fallbackModel,
                };
            }
        }
        return null;
    }
    // ── Process Input ──
    const processInput = useCallback(async (input) => {
        if (!input.trim())
            return;
        // Handle slash commands
        if (input.startsWith("/")) {
            const handled = handleSlashCommand(input);
            if (handled)
                return;
        }
        // ── ! Bash Mode: execute rest as bash command directly ──
        if (input.startsWith("!") && input.length > 1) {
            const bashCmd = input.slice(1).trim();
            if (bashCmd) {
                addOutput({ type: "text", content: `> !${bashCmd}` });
                try {
                    const result = execSync(bashCmd, { cwd, encoding: "utf-8", timeout: 30000, maxBuffer: 1024 * 1024 * 5, stdio: ["pipe", "pipe", "pipe"] });
                    addOutput({ type: "text", content: result || "(kein Output)" });
                }
                catch (e) {
                    const output = (e.stdout || "") + (e.stderr || "") || e.message;
                    addOutput({ type: "error", content: output });
                }
                return;
            }
        }
        // ── Budget check ──
        if (config.maxBudgetUsd && isBudgetExceeded(config.maxBudgetUsd)) {
            addOutput({ type: "error", content: `Budget-Limit erreicht ($${config.maxBudgetUsd}). Session-Kosten: $${getSessionCosts().totalCost.toFixed(4)}` });
            return;
        }
        // ── Bare "cd" command (without slash) ──
        if (/^cd\s+/.test(input.trim()) || input.trim() === "cd") {
            const cdArg = input.trim().replace(/^cd\s*/, "").trim() || "~";
            handleSlashCommand(`/cd ${cdArg}`);
            return;
        }
        // ── Auto-detect image generation intent → route to /imagine ──
        {
            const lower = input.toLowerCase();
            const imageKeywords = [
                "erstelle.*bild", "mach.*bild", "generiere.*bild", "erzeuge.*bild",
                "create.*image", "generate.*image", "make.*image", "draw.*image",
                "erstelle.*foto", "mach.*foto", "generiere.*foto",
                "create.*picture", "generate.*picture", "make.*picture",
                "erstelle.*wallpaper", "mach.*wallpaper",
                "bild von", "foto von", "image of", "picture of",
                "zeichne", "male mir", "paint me", "draw me",
            ];
            if (imageKeywords.some(kw => new RegExp(kw, "i").test(lower))) {
                addOutput({ type: "info", content: "Bild-Anfrage erkannt — leite zu /imagine weiter..." });
                handleSlashCommand(`/imagine ${input}`);
                return;
            }
        }
        setIsProcessing(true);
        const abort = new AbortController();
        abortRef.current = abort;
        const signal = abort.signal;
        // ── Auto-Fallback for complex tasks on local models ──
        let activeConfig = config;
        const fallback = detectFallbackConfig(input);
        if (fallback) {
            activeConfig = fallback.fallbackConfig;
            addOutput({ type: "info", content: `Komplexe Aufgabe erkannt — automatischer Upgrade zu ${getModelDisplayName(fallback.fallbackModel)} (${fallback.fallbackConfig.provider})` });
        }
        // Parse @-mentions
        const { cleanInput: mentionClean, mentions } = parseMentions(input, cwd);
        const mentionContext = formatMentionContext(mentions);
        if (mentions.length > 0) {
            addOutput({ type: "info", content: `${mentions.length} @-Mention(s) aufgeloest` });
        }
        // ── Auto-trigger skills ──
        const triggeredSkill = matchSkillByTrigger(mentionClean, cwd);
        if (triggeredSkill && !activeSkill) {
            setActiveSkill(triggeredSkill);
            addOutput({ type: "info", content: `Skill "${triggeredSkill.name}" auto-aktiviert` });
        }
        // ── Extended Thinking prefix ──
        const thinkingPrefix = getThinkingPromptPrefix();
        // Build user content
        let userContent = planMode
            ? `[PLAN-MODUS] Erstelle zuerst einen detaillierten Plan bevor du handelst.\n\n${mentionClean}`
            : thinkMode
                ? `Denke Schritt fuer Schritt nach. Nutze <think>...</think> Tags fuer deinen Denkprozess.\n\n${mentionClean}`
                : thinkingPrefix
                    ? thinkingPrefix + mentionClean
                    : mentionClean;
        if (mentionContext)
            userContent = mentionContext + "\n\n" + userContent;
        // ── Active skill prompt addition ──
        const skillToApply = activeSkill || triggeredSkill;
        if (skillToApply) {
            userContent += getSkillPromptAddition(skillToApply);
        }
        // ── Debug info ──
        if (debugMode) {
            addOutput({ type: "info", content: `[DEBUG] Messages: ${messages.length}, Tokens ~${Math.round(userContent.length / 4)}, Model: ${activeConfig.model}` });
        }
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
                }
                catch { }
            }
            else if (isWebQuery) {
                const searchQuery = mentionClean.replace(/^(suche?|finde?|google|recherchiere)\s*/i, "").trim() || mentionClean;
                addOutput({ type: "tool-activity", content: `WebSearch("${searchQuery}")` });
                try {
                    const searchResult = await webSearch(searchQuery);
                    addOutput({ type: "tool-result", tool: "web", result: searchResult.result, success: searchResult.success });
                    userContent += `\n\n--- Web-Suchergebnisse ---\n${searchResult.result}\n--- Ende ---`;
                }
                catch { }
            }
        }
        // Add user message
        const newMessages = [...messages, { role: "user", content: userContent }];
        setMessages(newMessages);
        // Show user input in output
        addOutput({ type: "text", content: `> ${input}` });
        // Start streaming
        setStreamText("");
        setStreamReasoning("");
        setIsStreaming(true);
        setStreamStart(Date.now());
        setStreamedChars(0);
        setThinkingStartTime(0);
        // Helper: save completed AI response to persistent output
        const saveResponseToOutput = (text, reasoning, start) => {
            if (text || reasoning) {
                addOutput({ type: "ai-response", streamingText: text, streamingReasoning: reasoning, startTime: start });
            }
            setStreamText("");
            setStreamReasoning("");
        };
        const maxTurns = activeConfig.maxTurns ?? 5;
        try {
            let fullResponse = "";
            let fullReasoning = "";
            let reasoningStart = 0;
            for await (const token of streamChat(newMessages, activeConfig, signal)) {
                if (signal.aborted)
                    break;
                if (token.type === "reasoning") {
                    if (!reasoningStart)
                        reasoningStart = Date.now();
                    fullReasoning += token.text;
                    setStreamReasoning(prev => prev + token.text);
                }
                else {
                    fullResponse += token.text;
                    setStreamText(prev => prev + token.text);
                    setStreamedChars(prev => prev + token.text.length);
                }
            }
            if (reasoningStart) {
                setThinkingStartTime(Math.round((Date.now() - reasoningStart) / 1000));
            }
            if (signal.aborted || !fullResponse) {
                // Still save any partial response that was shown
                saveResponseToOutput(fullResponse, fullReasoning, streamStart);
                setIsProcessing(false);
                setIsStreaming(false);
                return;
            }
            trackUsage(activeConfig.model, userContent, fullResponse);
            // Execute tools
            if (!chatOnly) {
                let toolResults = null;
                const roundStart = Date.now();
                try {
                    toolResults = await executeToolCalls(fullResponse, cwd);
                }
                catch { }
                if (toolResults && toolResults.results.length > 0) {
                    // Check allowedTools filter
                    if (activeConfig.allowedTools) {
                        toolResults.results = toolResults.results.filter(r => activeConfig.allowedTools.some(pattern => {
                            if (pattern.includes("(")) {
                                const [toolPart, argPattern] = pattern.split("(");
                                const argGlob = argPattern?.replace(")", "").replace("*", ".*");
                                return r.tool === toolPart && (!argGlob || new RegExp(argGlob).test(r.command || r.filePath || ""));
                            }
                            return r.tool === pattern;
                        }));
                    }
                    // Save initial AI response to output BEFORE showing tool results
                    saveResponseToOutput(fullResponse, fullReasoning, streamStart);
                    setIsStreaming(false);
                    // Show tool results as grouped ToolGroup — Claude Code style
                    const roundDuration = Date.now() - roundStart;
                    const estimatedTokens = Math.round(fullResponse.length / 4);
                    addOutput({
                        type: "tool-group",
                        toolResults: toolResults.results,
                        toolDuration: roundDuration,
                        toolTokens: estimatedTokens,
                        toolCount: toolResults.results.length,
                        expanded: toolResults.results.length <= 3,
                    });
                    const failedTools = toolResults.results.filter(r => !r.success);
                    const successTools = toolResults.results.filter(r => r.success);
                    const toolFeedback = toolResults.results.map(r => `[Tool: ${r.tool}] ${r.success ? "ERFOLG" : "FEHLGESCHLAGEN"}: ${r.result}`).join("\n\n");
                    let followUpInstruction = `Tool-Ergebnisse:\n${toolFeedback}\n\n`;
                    if (failedTools.length > 0) {
                        followUpInstruction += `ACHTUNG: ${failedTools.length} Tool(s) sind FEHLGESCHLAGEN! Sag dem User EHRLICH was nicht funktioniert hat und WARUM. Behaupte NICHT dass alles geklappt hat wenn Tools Fehler hatten. `;
                        if (failedTools.some(r => r.result?.includes("Unbekanntes Tool"))) {
                            followUpInstruction += `Du hast ein Tool benutzt das NICHT EXISTIERT. Nutze NUR: read, write, edit, delete, bash, grep, glob, ls, git, web, fetch, gh. Fuer Verschieben/Kopieren nutze <tool:bash>mv/cp</tool>. `;
                        }
                    }
                    if (successTools.length > 0) {
                        followUpInstruction += `Fasse zusammen was erfolgreich war. `;
                    }
                    followUpInstruction += `Fuehre KEINE weiteren Tools aus, es sei denn es ist notwendig um die urspruengliche Aufgabe abzuschliessen.`;
                    const msgsWithAssistant = [...newMessages, { role: "assistant", content: fullResponse }, { role: "user", content: followUpInstruction }];
                    setMessages(msgsWithAssistant);
                    // Follow-up streaming
                    setIsStreaming(true);
                    setStreamStart(Date.now());
                    let currentResponse = "";
                    let currentReasoning = "";
                    const followUpStart = Date.now();
                    try {
                        for await (const token of streamChat(msgsWithAssistant, activeConfig, signal)) {
                            if (signal.aborted)
                                break;
                            if (token.type === "reasoning") {
                                currentReasoning += token.text;
                                setStreamReasoning(prev => prev + token.text);
                            }
                            else {
                                currentResponse += token.text;
                                setStreamText(prev => prev + token.text);
                            }
                        }
                    }
                    catch { }
                    // Multi-turn tool loop (max turns, with loop detection)
                    let depth = 0;
                    let latestMessages = msgsWithAssistant;
                    let lastToolSig = "";
                    let consecutiveFailures = 0;
                    while (depth < maxTurns && currentResponse && !signal.aborted) {
                        let nested = null;
                        const nestedStart = Date.now();
                        try {
                            nested = await executeToolCalls(currentResponse, cwd);
                        }
                        catch {
                            break;
                        }
                        if (!nested || nested.results.length === 0)
                            break;
                        // Apply allowedTools filter
                        if (activeConfig.allowedTools) {
                            nested.results = nested.results.filter(r => activeConfig.allowedTools.some(pattern => {
                                if (pattern.includes("(")) {
                                    const [toolPart, argPattern] = pattern.split("(");
                                    const argGlob = argPattern?.replace(")", "").replace("*", ".*");
                                    return r.tool === toolPart && (!argGlob || new RegExp(argGlob).test(r.command || r.filePath || ""));
                                }
                                return r.tool === pattern;
                            }));
                            if (nested.results.length === 0)
                                break;
                        }
                        // Track consecutive failures
                        const allFailed = nested.results.every(r => !r.success);
                        if (allFailed) {
                            consecutiveFailures++;
                        }
                        else {
                            consecutiveFailures = 0;
                        }
                        // Break on 2+ consecutive all-fail rounds
                        if (consecutiveFailures >= 2) {
                            addOutput({ type: "info", content: "Wiederholte Fehler erkannt — Tool-Kette gestoppt." });
                            break;
                        }
                        // Loop detection: break if same tools are being called repeatedly
                        const toolSig = nested.results.map(r => `${r.tool}:${r.filePath || r.command || ""}`).join("|");
                        if (toolSig === lastToolSig) {
                            addOutput({ type: "info", content: "Loop erkannt — Tool-Kette gestoppt." });
                            break;
                        }
                        lastToolSig = toolSig;
                        // Save current response before showing tool results
                        saveResponseToOutput(currentResponse, currentReasoning, followUpStart);
                        setIsStreaming(false);
                        // Show as grouped ToolGroup
                        const nestedDuration = Date.now() - nestedStart;
                        const nestedTokens = Math.round(currentResponse.length / 4);
                        addOutput({
                            type: "tool-group",
                            toolResults: nested.results,
                            toolDuration: nestedDuration,
                            toolTokens: nestedTokens,
                            toolCount: nested.results.length,
                            expanded: nested.results.length <= 3,
                        });
                        const nestedFailed = nested.results.filter(r => !r.success);
                        const nestedFeedback = nested.results.map(r => `[Tool: ${r.tool}] ${r.success ? "ERFOLG" : "FEHLGESCHLAGEN"}: ${r.result}`).join("\n\n");
                        let nestedInstruction = `Tool-Ergebnisse:\n${nestedFeedback}\n\n`;
                        if (nestedFailed.length > 0) {
                            nestedInstruction += `ACHTUNG: ${nestedFailed.length} Tool(s) FEHLGESCHLAGEN! Sag EHRLICH was nicht funktioniert hat. Behaupte NICHT dass es geklappt hat. `;
                            if (nestedFailed.some(r => r.result?.includes("Unbekanntes Tool"))) {
                                nestedInstruction += `Du hast ein NICHT EXISTIERENDES Tool benutzt! Nutze NUR: read, write, edit, delete, bash, grep, glob, ls, git, web, fetch, gh. `;
                            }
                        }
                        nestedInstruction += `Fuehre KEINE weiteren Tools aus, es sei denn es ist notwendig um die urspruengliche Aufgabe abzuschliessen.`;
                        latestMessages = [...latestMessages, { role: "assistant", content: currentResponse }, { role: "user", content: nestedInstruction }];
                        setMessages(latestMessages);
                        // Start new streaming round
                        setIsStreaming(true);
                        setStreamStart(Date.now());
                        currentResponse = "";
                        currentReasoning = "";
                        try {
                            for await (const token of streamChat(latestMessages, activeConfig, signal)) {
                                if (signal.aborted)
                                    break;
                                if (token.type === "reasoning") {
                                    currentReasoning += token.text;
                                    setStreamReasoning(prev => prev + token.text);
                                }
                                else {
                                    currentResponse += token.text;
                                    setStreamText(prev => prev + token.text);
                                }
                            }
                        }
                        catch {
                            break;
                        }
                        depth++;
                    }
                    // Save final response
                    if (currentResponse) {
                        saveResponseToOutput(currentResponse, currentReasoning, followUpStart);
                        setMessages(prev => [...prev, { role: "assistant", content: currentResponse }]);
                    }
                }
                else {
                    // No tools called — save response to output
                    saveResponseToOutput(fullResponse, fullReasoning, streamStart);
                    setMessages(prev => [...prev, { role: "assistant", content: fullResponse }]);
                }
            }
            else {
                // Chat only — save response to output
                saveResponseToOutput(fullResponse, fullReasoning, streamStart);
                setMessages(prev => [...prev, { role: "assistant", content: fullResponse }]);
            }
        }
        catch (e) {
            if (!signal.aborted) {
                addOutput({ type: "error", content: `Fehler: ${e.message}` });
            }
        }
        finally {
            setIsProcessing(false);
            setIsStreaming(false);
            setStreamText("");
            setStreamReasoning("");
            abortRef.current = null;
        }
    }, [messages, config, activeAgent, activeSkill, planMode, thinkMode, debugMode, chatOnly, cwd, customCommands]);
    // ── Render output item ──
    function renderOutputItem(item) {
        switch (item.type) {
            case "banner":
                return _jsx(Banner, { config: config, ctx: ctx, skipPermissions: skipPermissions }, item.id);
            case "help":
                return _jsx(Help, {}, item.id);
            case "features":
                return _jsx(Features, {}, item.id);
            case "text":
                return (_jsx(Box, { marginLeft: 2, marginY: 1, children: _jsx(Text, { wrap: "wrap", children: item.content }) }, item.id));
            case "info":
                return (_jsx(Box, { marginLeft: 2, marginY: 1, children: _jsx(Text, { color: info, wrap: "wrap", children: item.content }) }, item.id));
            case "success":
                return (_jsx(Box, { marginLeft: 2, marginY: 1, children: _jsxs(Text, { color: successColor, children: ["  \u2713 ", item.content] }) }, item.id));
            case "error":
                return (_jsx(Box, { marginLeft: 2, marginY: 1, children: _jsxs(Text, { color: errorColor, children: ["  \u2717 ", item.content] }) }, item.id));
            case "ai-response":
                return (_jsx(StreamingOutput, { text: item.streamingText || "", reasoning: item.streamingReasoning || "", isStreaming: false, startTime: item.startTime || 0 }, item.id));
            case "tool-result":
                return (_jsx(ToolResultBox, { tool: item.tool || "", result: item.result || "", success: item.success ?? true, diff: item.diff, filePath: item.filePath, linesChanged: item.linesChanged, command: item.command, startLineNumber: item.startLineNumber }, item.id));
            case "tool-group":
                return (_jsx(ToolGroup, { results: item.toolResults || [], duration: item.toolDuration || 0, tokenCount: item.toolTokens || 0, expanded: item.expanded ?? true, toolUseCount: item.toolCount || 0 }, item.id));
            case "tool-activity":
                return (_jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { color: info, bold: true, children: "⏺ " }), _jsx(Text, { color: info, children: item.content }), _jsx(Text, { color: dim, children: " …" })] }, item.id));
            default:
                return null;
        }
    }
    // ── Render ──
    return (_jsxs(_Fragment, { children: [_jsx(Static, { items: output, children: (item) => renderOutputItem(item) }), _jsxs(Box, { flexDirection: "column", children: [isStreaming && !streamText && !streamReasoning && (_jsx(MorningstarSpinner, { startTime: streamStart, streamedChars: streamedChars, thinkingTime: thinkingStartTime > 0 ? thinkingStartTime : undefined })), (streamText || streamReasoning) && (_jsx(StreamingOutput, { text: streamText, reasoning: streamReasoning, isStreaming: isStreaming, startTime: streamStart })), _jsx(Box, { marginTop: 0, children: _jsx(Input, { onSubmit: processInput, activeAgent: activeAgent, planMode: planMode, thinkMode: thinkMode, isProcessing: isProcessing, suggestions: slashCommands, vimMode: vimMode }) }), showStatusLine && (_jsxs(_Fragment, { children: [_jsx(Box, { marginLeft: 0, marginTop: 0, children: _jsx(Text, { color: dim, children: "─".repeat(70) }) }), _jsxs(Box, { marginLeft: 1, gap: 1, children: [_jsxs(Text, { color: accent, bold: true, children: ["📁 ", cwd.replace(homedir(), "~")] }), _jsx(Text, { color: dim, children: "│" }), _jsxs(Text, { color: primary, bold: true, children: ["🤖 ", config.model.length > 25 ? config.model.slice(0, 25) + "…" : config.model] }), _jsx(Text, { color: dim, children: "│" }), _jsx(Text, { color: (config.provider || "deepseek") === "ollama" ? successColor : info, children: (config.provider || "deepseek") === "ollama" ? "⚡ lokal" : `☁️  ${config.provider || "deepseek"}` }), activeAgent && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "│" }), _jsxs(Text, { color: warning, children: ["🕵️ ", activeAgent] })] })), activeSkill && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "│" }), _jsxs(Text, { color: accent, children: ["🎯 ", activeSkill.name] })] })), vimMode && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "│" }), _jsx(Text, { color: accent, children: "VIM" })] })), config.fast && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "│" }), _jsx(Text, { color: warning, children: "FAST" })] })), debugMode && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "│" }), _jsx(Text, { color: errorColor, children: "DEBUG" })] })), config.maxBudgetUsd && (_jsxs(_Fragment, { children: [_jsx(Text, { color: dim, children: "│" }), _jsxs(Text, { color: info, children: ["💰 $", getRemainingBudget(config.maxBudgetUsd).toFixed(2)] })] }))] }), _jsx(Box, { marginLeft: 1, children: _jsx(ContextRadar, { messages: messages }) })] }))] })] }));
}
//# sourceMappingURL=app.js.map