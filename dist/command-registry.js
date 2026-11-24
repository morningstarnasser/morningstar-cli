/**
 * Typed slash-command metadata and discovery.
 *
 * The registry deliberately contains no UI or command-handler code. This keeps
 * validation, dynamic command discovery, autocomplete, and help generation
 * deterministic and easy to test.
 */
export const COMMAND_CATEGORIES = [
    { id: "general", title: "Allgemein" },
    { id: "ai", title: "AI & Model" },
    { id: "agents", title: "Agenten & Delegation" },
    { id: "skills", title: "Skills & Rules" },
    { id: "teams", title: "Agent Teams" },
    { id: "memory", title: "Notizen & Aufgaben" },
    { id: "git", title: "Git & Checkpoints" },
    { id: "analysis", title: "Codebase-Analyse" },
    { id: "project", title: "Dateien & Projekt" },
    { id: "sessions", title: "History & Sessions" },
    { id: "media", title: "Vision & Bilder" },
    { id: "modes", title: "Darstellung & Modes" },
    { id: "integrations", title: "Plugins & Integrationen" },
    { id: "system", title: "System & Learning" },
    { id: "custom", title: "Custom Commands" },
];
/** Thrown when command metadata is malformed or names are ambiguous. */
export class CommandRegistryValidationError extends Error {
    issues;
    constructor(issues) {
        super(`Invalid command registry:\n${issues.map((issue) => `- ${issue.message}`).join("\n")}`);
        this.name = "CommandRegistryValidationError";
        this.issues = Object.freeze([...issues]);
    }
}
const CATEGORY_IDS = new Set(COMMAND_CATEGORIES.map((category) => category.id));
const COMMAND_NAME_PATTERN = /^[a-z0-9][a-z0-9:_-]*(?: [a-z0-9][a-z0-9:_-]*)*$/;
const COMMAND_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;
/** Normalize a command or alias for case-insensitive lookup. */
export function normalizeCommandName(value) {
    return value.trim().replace(/^\//, "").trim().replace(/\s+/g, " ").toLowerCase();
}
function issue(code, commandId, value, message, conflictsWith) {
    return { code, commandId, value, conflictsWith, message };
}
/**
 * Return every validation issue instead of failing at the first collision.
 * Collision checks are case-insensitive and independent of declaration order.
 */
export function validateCommandDefinitions(definitions) {
    const issues = [];
    const ids = new Map();
    const bindings = new Map();
    for (const definition of definitions) {
        const id = typeof definition.id === "string" ? definition.id.trim() : "";
        const name = typeof definition.name === "string" ? normalizeCommandName(definition.name) : "";
        if (!COMMAND_ID_PATTERN.test(id)) {
            issues.push(issue("invalid-id", id || "<missing>", id, `Command id "${id}" is invalid.`));
        }
        else {
            const existingId = ids.get(id);
            if (existingId) {
                issues.push(issue("duplicate-id", id, id, `Command id "${id}" is duplicated.`, existingId));
            }
            else {
                ids.set(id, id);
            }
        }
        const hasValidName = COMMAND_NAME_PATTERN.test(name);
        if (!hasValidName) {
            issues.push(issue("invalid-name", id, name, `Command "${id}" has invalid name "${name}".`));
        }
        if (!CATEGORY_IDS.has(definition.category)) {
            issues.push(issue("invalid-category", id, String(definition.category), `Command "${id}" has an invalid category.`));
        }
        if (typeof definition.description !== "string" || definition.description.trim().length === 0) {
            issues.push(issue("invalid-description", id, "", `Command "${id}" needs a description.`));
        }
        if (typeof definition.usage !== "string" || !definition.usage.trim().startsWith("/")) {
            issues.push(issue("invalid-usage", id, String(definition.usage), `Command "${id}" usage must start with "/".`));
        }
        else if (hasValidName) {
            const usage = definition.usage.trim().toLowerCase();
            const expectedPrefix = `/${name}`;
            if (usage !== expectedPrefix && !usage.startsWith(`${expectedPrefix} `)) {
                issues.push(issue("invalid-usage", id, definition.usage, `Command "${id}" usage must start with "${expectedPrefix}".`));
            }
        }
        if (definition.behavior !== "immediate" && definition.behavior !== "prompt") {
            issues.push(issue("invalid-behavior", id, String(definition.behavior), `Command "${id}" has invalid behavior.`));
        }
        if (definition.whenBusy !== "run" && definition.whenBusy !== "queue") {
            issues.push(issue("invalid-busy-behavior", id, String(definition.whenBusy), `Command "${id}" has invalid busy behavior.`));
        }
        if (definition.isAvailable !== undefined && typeof definition.isAvailable !== "function") {
            issues.push(issue("invalid-availability", id, String(definition.isAvailable), `Command "${id}" availability must be a function.`));
        }
        if (typeof definition.deprecated === "string"
            && definition.deprecated.trim().length === 0) {
            issues.push(issue("invalid-deprecation", id, "", `Command "${id}" has an empty deprecation reason.`));
        }
        if (hasValidName) {
            const existing = bindings.get(name);
            if (existing) {
                const code = existing.kind === "name" ? "duplicate-name" : "name-alias-collision";
                issues.push(issue(code, id, name, `Command name "/${name}" collides with "${existing.commandId}".`, existing.commandId));
            }
            else {
                bindings.set(name, { commandId: id, kind: "name" });
            }
        }
        const localAliases = new Set();
        for (const rawAlias of definition.aliases ?? []) {
            const alias = typeof rawAlias === "string" ? normalizeCommandName(rawAlias) : "";
            if (!COMMAND_NAME_PATTERN.test(alias)) {
                issues.push(issue("invalid-alias", id, alias, `Command "${id}" has invalid alias "${alias}".`));
                continue;
            }
            if (alias === name) {
                issues.push(issue("self-alias", id, alias, `Command "${id}" repeats its name as alias "/${alias}".`));
                continue;
            }
            if (localAliases.has(alias)) {
                issues.push(issue("duplicate-alias", id, alias, `Command "${id}" repeats alias "/${alias}".`));
                continue;
            }
            localAliases.add(alias);
            const existing = bindings.get(alias);
            if (existing) {
                const code = existing.kind === "name" ? "name-alias-collision" : "alias-collision";
                issues.push(issue(code, id, alias, `Alias "/${alias}" collides with "${existing.commandId}".`, existing.commandId));
            }
            else {
                bindings.set(alias, { commandId: id, kind: "alias" });
            }
        }
    }
    return Object.freeze(issues);
}
function freezeDefinition(definition) {
    return Object.freeze({
        ...definition,
        id: definition.id.trim(),
        name: normalizeCommandName(definition.name),
        aliases: Object.freeze((definition.aliases ?? []).map(normalizeCommandName)),
        description: definition.description.trim(),
        usage: definition.usage.trim(),
    });
}
function isVisible(command, options) {
    if (command.hidden && !options.includeHidden)
        return false;
    if (command.deprecated && !options.includeDeprecated)
        return false;
    if (!options.includeUnavailable && command.isAvailable && !command.isAvailable(options.context))
        return false;
    return true;
}
function matchScore(command, prefix) {
    if (command.name === prefix)
        return 0;
    if ((command.aliases ?? []).includes(prefix))
        return 1;
    if (command.name.startsWith(prefix))
        return 2;
    if ((command.aliases ?? []).some((alias) => alias.startsWith(prefix)))
        return 3;
    return Number.POSITIVE_INFINITY;
}
/**
 * Immutable command registry. `merge` returns a new validated instance, making
 * runtime additions safe to assemble from custom commands, agents, and models.
 */
export class CommandRegistry {
    commands;
    commandsById = new Map();
    bindings = new Map();
    bindingOrder;
    constructor(definitions = []) {
        const validationIssues = validateCommandDefinitions(definitions);
        if (validationIssues.length > 0) {
            throw new CommandRegistryValidationError(validationIssues);
        }
        this.commands = Object.freeze(definitions.map(freezeDefinition));
        for (const command of this.commands) {
            this.commandsById.set(command.id, command);
            this.bindings.set(command.name, { command, name: command.name, isAlias: false });
            for (const alias of command.aliases ?? []) {
                this.bindings.set(alias, { command, name: alias, isAlias: true });
            }
        }
        this.bindingOrder = Object.freeze([...this.bindings.values()].sort((left, right) => {
            const wordDifference = right.name.split(" ").length - left.name.split(" ").length;
            return wordDifference || right.name.length - left.name.length;
        }));
    }
    get size() {
        return this.commands.length;
    }
    /** All registered definitions, including hidden, deprecated, and unavailable entries. */
    list() {
        return this.commands;
    }
    getById(id) {
        return this.commandsById.get(id.trim());
    }
    /** Resolve an exact canonical name or alias regardless of visibility. */
    resolve(nameOrAlias) {
        return this.bindings.get(normalizeCommandName(nameOrAlias))?.command;
    }
    /**
     * Resolve the longest command/alias prefix from a submitted line.
     * Hidden and unavailable commands remain resolvable so dispatch can provide a
     * precise disabled/deprecated message instead of treating them as a prompt.
     */
    resolveInput(input) {
        const raw = input.trim().replace(/^\//, "").trim();
        const tokens = raw.length > 0 ? raw.split(/\s+/) : [];
        const normalized = tokens.map((token) => token.toLowerCase());
        for (const binding of this.bindingOrder) {
            const bindingTokens = binding.name.split(" ");
            if (bindingTokens.length > normalized.length)
                continue;
            if (!bindingTokens.every((token, index) => token === normalized[index]))
                continue;
            return {
                command: binding.command,
                invokedAs: binding.name,
                args: tokens.slice(bindingTokens.length).join(" "),
                isAlias: binding.isAlias,
            };
        }
        return undefined;
    }
    isAvailable(command, context) {
        return command.isAvailable?.(context) ?? true;
    }
    /**
     * Prefix search over canonical names and aliases. Results are de-duplicated by
     * command and ranked by exact-name, exact-alias, name-prefix, alias-prefix.
     */
    search(prefix = "", options = {}) {
        const normalizedPrefix = normalizeCommandName(prefix);
        return this.commands
            .map((command, index) => ({
            command,
            index,
            score: normalizedPrefix ? matchScore(command, normalizedPrefix) : 0,
        }))
            .filter(({ command, score }) => Number.isFinite(score) && isVisible(command, options))
            .sort((left, right) => left.score - right.score || left.index - right.index)
            .map(({ command }) => command);
    }
    /** Group advertised commands into stable UI help sections. */
    groupForHelp(options = {}) {
        const visibleCommands = this.commands.filter((command) => isVisible(command, options));
        return COMMAND_CATEGORIES.flatMap((category) => {
            const commands = visibleCommands.filter((command) => command.category === category.id);
            return commands.length > 0
                ? [{ category: category.id, title: category.title, commands: Object.freeze(commands) }]
                : [];
        });
    }
    /**
     * Compatibility adapter for the current App/Input `{cmd, desc}` contract.
     * Placeholders stay in `usage` for help; autocomplete inserts executable
     * command prefixes. Aliases are included by default so compatibility names
     * can be discovered by the existing prefix filter.
     */
    toAutocompleteItems(options = {}) {
        const includeAliases = options.includeAliases ?? true;
        const prefix = normalizeCommandName(options.prefix ?? "");
        const commands = this.search(prefix, options);
        const items = [];
        for (const command of commands) {
            const names = includeAliases ? [command.name, ...(command.aliases ?? [])] : [command.name];
            for (const name of names) {
                if (prefix && !name.startsWith(prefix))
                    continue;
                items.push(Object.freeze({ cmd: `/${name}`, desc: command.description }));
            }
        }
        return Object.freeze(items);
    }
    merge(additions, options = {}) {
        if (!options.replaceById) {
            return new CommandRegistry([...this.commands, ...additions]);
        }
        const replacementIds = new Set(additions.map((command) => command.id.trim()));
        const retained = this.commands.filter((command) => !replacementIds.has(command.id));
        return new CommandRegistry([...retained, ...additions]);
    }
}
/** Build an availability gate that can be enabled explicitly by an integration. */
export function requiresCapability(capability) {
    return (context) => context?.capabilities?.has(capability) ?? false;
}
function seed(id, name, category, description, usage = `/${name}`, options = {}) {
    const behavior = options.behavior ?? "immediate";
    return {
        id,
        name,
        aliases: options.aliases,
        category,
        description,
        usage,
        behavior,
        whenBusy: options.whenBusy ?? (behavior === "prompt" ? "queue" : "run"),
        isAvailable: options.isAvailable,
        hidden: options.hidden,
        deprecated: options.deprecated,
    };
}
const planned = (commandId) => requiresCapability(`command:${commandId}`);
/**
 * Built-in Morningstar surface. Subcommands are first-class metadata entries
 * because the current autocomplete supports multi-word prefixes.
 *
 * Entries whose App handler does not exist yet are capability-gated and are
 * therefore absent from autocomplete/help/search by default.
 */
export const MORNINGSTAR_COMMANDS = Object.freeze([
    seed("general.help", "help", "general", "Alle Befehle anzeigen"),
    seed("general.features", "features", "general", "Alle Features anzeigen"),
    seed("general.clear", "clear", "general", "Konversation zuruecksetzen", "/clear [name]", { aliases: ["reset", "new"], whenBusy: "queue" }),
    seed("general.compact", "compact", "general", "Konversation komprimieren", "/compact [focus]", { whenBusy: "queue" }),
    seed("ai.btw", "btw", "ai", "Isolierte Nebenfrage ohne Werkzeuge oder Änderung des Gesprächs", "/btw <Frage>", { whenBusy: "queue" }),
    seed("general.export", "export", "general", "Konversation als Markdown exportieren", "/export [filename]"),
    seed("general.copy", "copy", "general", "Letzte Antwort in die Zwischenablage kopieren"),
    seed("sessions.remote-control", "remote-control", "sessions", "Handy verbinden; erneut öffnen zum Deaktivieren", "/remote-control [start|status|stop|qr|lan|local]", { aliases: ["rc"], whenBusy: "run" }),
    seed("general.rename", "rename", "general", "Session umbenennen", "/rename <name>"),
    seed("general.rewind", "rewind", "general", "Gesprächspunkt wählen, wiederherstellen oder zusammenfassen", "/rewind", { whenBusy: "queue" }),
    seed("general.debug", "debug", "general", "Debug-Modus an/aus"),
    seed("general.statusline", "statusline", "general", "Status-Bar an/aus"),
    seed("general.quit", "quit", "general", "Morningstar beenden", "/quit", { aliases: ["exit", "q"], whenBusy: "queue" }),
    seed("ai.model", "model", "ai", "Provider und Modell anzeigen oder wechseln", "/model [provider] [id]"),
    seed("ai.provider", "provider", "ai", "Provider anzeigen oder wechseln", "/provider [name]"),
    seed("ai.providers", "providers", "ai", "Alle Provider und Models anzeigen"),
    seed("ai.context", "context", "ai", "Projekt-Kontext anzeigen"),
    seed("ai.cost", "cost", "ai", "Token- und Kostentracking anzeigen", "/cost", { aliases: ["usage"] }),
    seed("ai.stats", "stats", "ai", "Session-Statistiken anzeigen"),
    seed("ai.permissions", "permissions", "ai", "Permission-Modus anzeigen oder wechseln", "/permissions [mode]", { aliases: ["allowed-tools"] }),
    seed("ai.settings", "settings", "ai", "Projekt-Settings anzeigen"),
    seed("ai.settings.init", "settings init", "ai", "Projekt-Settings erstellen"),
    seed("ai.plan", "plan", "ai", "Plan-Modus an/aus", "/plan [task]"),
    seed("ai.think", "think", "ai", "Think-Modus an/aus"),
    seed("ai.effort", "effort", "ai", "Thinking Effort einstellen", "/effort [low|medium|high|ultra]"),
    seed("ai.ultrathink", "ultrathink", "ai", "Ultra-Think Modus an/aus"),
    seed("ai.max-turns", "max-turns", "ai", "Maximale Auto-Fix-Durchlaeufe einstellen", "/max-turns [0|unlimited|n]"),
    seed("ai.fast", "fast", "ai", "Fast Mode an/aus"),
    seed("ai.review", "review", "ai", "Code-Review als Prompt starten", "/review [path]", { behavior: "prompt", isAvailable: planned("review") }),
    seed("agents.list", "agents", "agents", "Verfuegbare Agenten anzeigen", "/agents", { aliases: ["agent:list"] }),
    seed("agents.off", "agent:off", "agents", "Aktiven Agent deaktivieren"),
    seed("agents.migrate", "agent:migrate", "agents", "Agents zu Markdown migrieren"),
    seed("agents.delegate", "delegate", "agents", "Task an einen Sub-Agent delegieren", "/delegate <agent> <task>", { whenBusy: "queue" }),
    seed("agents.delegate-list", "delegate:list", "agents", "Verfuegbare Sub-Agents anzeigen"),
    seed("agents.swarm", "swarm", "agents", "Team mit Teilaufgaben und Abhängigkeiten starten", "/swarm <Ziel | @plan.json>", { whenBusy: "queue" }),
    seed("general.activity", "activity", "general", "Arbeitsverlauf: Tools, Agents und Laufzeiten"),
    seed("general.find", "find", "general", "Verlauf durchsuchen (Ctrl+F; Cmd+F bei Weitergabe durch das Terminal)", "/find [text]", { whenBusy: "run" }),
    seed("agents.parallel", "parallel", "agents", "Mehrere Agents parallel starten", "/parallel <agent,...> <task>", { whenBusy: "queue" }),
    seed("agents.create", "agent:create", "agents", "Neuen Agent erstellen", "/agent:create [definition]", { isAvailable: planned("agent:create") }),
    seed("agents.edit", "agent:edit", "agents", "Custom Agent bearbeiten", "/agent:edit <id>", { isAvailable: planned("agent:edit") }),
    seed("agents.delete", "agent:delete", "agents", "Custom Agent loeschen", "/agent:delete <id>", { isAvailable: planned("agent:delete") }),
    seed("agents.show", "agent:show", "agents", "Agent-Details anzeigen", "/agent:show <id>", { isAvailable: planned("agent:show") }),
    seed("skills.list", "skill", "skills", "Skills anzeigen", "/skill", { aliases: ["skills"] }),
    seed("skills.list-colon", "skill:list", "skills", "Alle Skills anzeigen"),
    seed("skills.create", "skill:create", "skills", "Neuen Skill erstellen", "/skill:create <id> <name> | <description>"),
    seed("skills.off", "skill:off", "skills", "Aktiven Skill deaktivieren"),
    seed("rules.list", "rules", "skills", "Alle Rules anzeigen"),
    seed("rules.list-explicit", "rules list", "skills", "Alle Rules anzeigen"),
    seed("rules.add", "rules add", "skills", "Neue Rule erstellen", "/rules add <id> [content]"),
    seed("rules.show", "rules show", "skills", "Rule anzeigen", "/rules show <id>"),
    seed("teams.list", "team", "teams", "Agent Teams anzeigen"),
    seed("teams.list-explicit", "team list", "teams", "Agent Teams anzeigen"),
    seed("teams.create", "team create", "teams", "Neues Team erstellen", "/team create <id> [name]"),
    seed("teams.add", "team add", "teams", "Agent mit Rolle zum Team hinzufuegen", "/team add <team> <agent> <lead|worker|reviewer>"),
    seed("teams.remove", "team remove", "teams", "Agent aus Team entfernen", "/team remove <team> <agent>"),
    seed("teams.show", "team show", "teams", "Team-Details anzeigen", "/team show <id>"),
    seed("teams.delete", "team delete", "teams", "Team loeschen", "/team delete <id>"),
    seed("teams.run", "team run", "teams", "Team ausfuehren", "/team run <name> <task>", { whenBusy: "queue" }),
    seed("memory.root", "memory", "memory", "Notizen anzeigen oder verwalten", "/memory [add|list|search|remove|clear]"),
    seed("memory.add", "memory add", "memory", "Notiz speichern", "/memory add <text>"),
    seed("memory.list", "memory list", "memory", "Alle Notizen anzeigen"),
    seed("memory.search", "memory search", "memory", "Notizen durchsuchen", "/memory search <query>"),
    seed("memory.remove", "memory remove", "memory", "Notiz loeschen", "/memory remove <id>"),
    seed("memory.delete", "memory delete", "memory", "Notiz loeschen", "/memory delete <id>", { hidden: true }),
    seed("memory.clear", "memory clear", "memory", "Alle Notizen loeschen"),
    seed("todo.root", "todo", "memory", "Aufgaben anzeigen oder verwalten", "/todo [add|list|done|remove|clear]"),
    seed("todo.add", "todo add", "memory", "Aufgabe hinzufuegen", "/todo add <text>"),
    seed("todo.list", "todo list", "memory", "Aufgaben anzeigen"),
    seed("todo.done", "todo done", "memory", "Aufgabe als erledigt markieren", "/todo done <id>"),
    seed("todo.remove", "todo remove", "memory", "Aufgabe loeschen", "/todo remove <id>"),
    seed("todo.clear", "todo clear", "memory", "Erledigte Aufgaben entfernen"),
    seed("git.diff", "diff", "git", "Git diff anzeigen", "/diff [staged]"),
    seed("git.diff-staged", "diff staged", "git", "Staged Changes anzeigen"),
    seed("git.status", "status", "git", "Git status anzeigen"),
    seed("git.log", "log", "git", "Git log anzeigen", "/log [count]"),
    seed("git.branches", "branches", "git", "Git Branches anzeigen", "/branches", { aliases: ["git-branches"] }),
    seed("git.checkpoint", "checkpoint", "git", "Checkpoint anzeigen oder erstellen", "/checkpoint [name]"),
    seed("git.checkpoint-create", "checkpoint create", "git", "Checkpoint erstellen", "/checkpoint create [name]"),
    seed("git.checkpoint-list", "checkpoint list", "git", "Checkpoints anzeigen"),
    seed("git.checkpoint-restore", "checkpoint restore", "git", "Checkpoint wiederherstellen", "/checkpoint restore <id>", { whenBusy: "queue" }),
    seed("git.checkpoint-delete", "checkpoint delete", "git", "Checkpoint loeschen", "/checkpoint delete <id>", { whenBusy: "queue" }),
    seed("git.commit", "commit", "git", "Smart Commit als Prompt starten", "/commit [instructions]", { behavior: "prompt", isAvailable: planned("commit") }),
    seed("analysis.onboard", "onboard", "analysis", "Projekt-Onboarding anzeigen"),
    seed("analysis.score", "score", "analysis", "Projekt-Qualitaetsscore anzeigen"),
    seed("analysis.roast", "roast", "analysis", "Code Roast anzeigen"),
    seed("analysis.map", "map", "analysis", "Codebase Map anzeigen"),
    seed("analysis.graph", "graph", "analysis", "Dependency Graph anzeigen", "/graph", { aliases: ["deps", "depgraph"] }),
    seed("analysis.pr-review", "pr-review", "analysis", "Pull Request analysieren", "/pr-review <url|number>", { aliases: ["code-review"], whenBusy: "queue" }),
    seed("analysis.pr-comments", "pr-comments", "analysis", "PR Review Comments an den Agent geben", "/pr-comments [pr]", {
        behavior: "prompt",
        whenBusy: "queue",
        deprecated: "Claude Code removed /pr-comments; ask the agent directly when possible.",
    }),
    seed("project.cd", "cd", "project", "Verzeichnis wechseln", "/cd [path]", { whenBusy: "queue" }),
    seed("project.init", "init", "project", "MORNINGSTAR.md erstellen"),
    seed("project.undo", "undo", "project", "Letzte Datei-Aenderung rueckgaengig", "/undo [list]", { whenBusy: "queue" }),
    seed("project.search", "search", "project", "Im Projekt suchen", "/search <query>"),
    seed("project.watch", "watch", "project", "File Watcher an/aus"),
    seed("sessions.history", "history", "sessions", "Gespeicherte Sessions anzeigen", "/history [subcommand]"),
    seed("sessions.history-save", "history save", "sessions", "Konversation speichern", "/history save [name]"),
    seed("sessions.history-list", "history list", "sessions", "Gespeicherte Sessions anzeigen"),
    seed("sessions.history-load", "history load", "sessions", "Session laden", "/history load <id>", { aliases: ["resume", "continue"], whenBusy: "queue" }),
    seed("sessions.history-delete", "history delete", "sessions", "Session loeschen", "/history delete <id>", { whenBusy: "queue" }),
    seed("sessions.branch", "branch", "sessions", "Konversation verzweigen oder verwalten", "/branch [name|list|switch|merge|delete]", { whenBusy: "queue" }),
    seed("sessions.branch-list", "branch list", "sessions", "Konversations-Branches anzeigen"),
    seed("sessions.branch-switch", "branch switch", "sessions", "Zu einem Konversations-Branch wechseln", "/branch switch <id>", { whenBusy: "queue" }),
    seed("sessions.branch-merge", "branch merge", "sessions", "Konversations-Branch zusammenfuehren", "/branch merge <id>", { whenBusy: "queue" }),
    seed("sessions.branch-delete", "branch delete", "sessions", "Konversations-Branch loeschen", "/branch delete <id>", { whenBusy: "queue" }),
    seed("media.vision", "vision", "media", "Bild analysieren", "/vision <path> [prompt]", { whenBusy: "queue" }),
    seed("media.imagine", "imagine", "media", "Bild generieren", "/imagine <prompt>", { whenBusy: "queue" }),
    seed("media.serve", "serve", "media", "API Server starten", "/serve [port]", { whenBusy: "queue", isAvailable: planned("serve") }),
    seed("modes.theme", "theme", "modes", "Theme anzeigen oder wechseln", "/theme [id]"),
    seed("modes.vim", "vim", "modes", "Vim Keybindings an/aus"),
    seed("modes.terminal-setup", "terminal-setup", "modes", "Terminal-Bindings anzeigen"),
    seed("modes.config", "config", "modes", "Konfiguration anzeigen"),
    seed("modes.split", "split", "modes", "Terminal Layout anzeigen oder wechseln", "/split [layout]"),
    seed("modes.split-list", "split list", "modes", "Verfuegbare Terminal Layouts anzeigen"),
    seed("integrations.hooks", "hooks", "integrations", "Lifecycle Hooks anzeigen"),
    seed("integrations.mcp", "mcp", "integrations", "MCP Server verwalten", "/mcp [subcommand]"),
    seed("integrations.mcp-add", "mcp add", "integrations", "MCP Server hinzufuegen", "/mcp add <name> <command> [args]"),
    seed("integrations.mcp-remove", "mcp remove", "integrations", "MCP Server entfernen", "/mcp remove <name>"),
    seed("integrations.mcp-connect", "mcp connect", "integrations", "MCP Server verbinden", "/mcp connect <name>", { whenBusy: "queue" }),
    seed("integrations.mcp-disconnect", "mcp disconnect", "integrations", "MCP Server trennen", "/mcp disconnect <name>", { whenBusy: "queue" }),
    seed("integrations.mcp-tools", "mcp tools", "integrations", "Verfuegbare MCP Tools anzeigen", "/mcp tools", { whenBusy: "queue" }),
    seed("integrations.plugins", "plugins", "integrations", "Installierte Plugins anzeigen", "/plugins", { aliases: ["plugin"] }),
    seed("integrations.chrome", "chrome", "integrations", "Chrome Integration anzeigen", "/chrome [launch [url]]", { whenBusy: "queue" }),
    seed("integrations.sandbox", "sandbox", "integrations", "Sandbox-Status anzeigen oder wechseln", "/sandbox [on|off]"),
    seed("system.doctor", "doctor", "system", "Setup diagnostizieren", "/doctor", { aliases: ["checkup"], whenBusy: "queue" }),
    seed("system.audit", "audit", "system", "Tiefere Systemanalyse ausfuehren", "/audit", { whenBusy: "queue" }),
    seed("system.repair", "repair", "system", "Erkannte Probleme automatisch beheben", "/repair", { whenBusy: "queue" }),
    seed("system.instincts", "instincts", "system", "Gelernte Instincts anzeigen", "/instincts", { aliases: ["instinct-status"] }),
    seed("system.instinct-export", "instinct-export", "system", "Instincts als JSON exportieren"),
    seed("system.instinct-import", "instinct-import", "system", "Instincts importieren", "/instinct-import <file>", { whenBusy: "queue" }),
    seed("system.update", "update", "system", "Auf Updates pruefen", "/update [check|run]"),
    seed("system.update-check", "update check", "system", "Auf Updates pruefen"),
    seed("system.update-run", "update run", "system", "Self-Update ausfuehren", "/update run", { whenBusy: "queue" }),
    seed("system.cache", "cache", "system", "Prompt Cache Statistiken anzeigen"),
    seed("system.dashboard", "dashboard", "system", "Web Dashboard starten oder anzeigen", "/dashboard [port]", { whenBusy: "queue" }),
    seed("system.login", "login", "system", "Anmelden: Abo (OAuth) oder API-Key", "/login", { aliases: ["auth"] }),
    seed("system.logout", "logout", "system", "Abmelden oder gespeicherten API-Key entfernen", "/logout [provider]", { whenBusy: "queue" }),
    seed("system.bug", "bug", "system", "Bug Report oeffnen", "/bug [report]", { aliases: ["feedback", "share"] }),
]);
/** Validated immutable registry for the built-in Morningstar command surface. */
export const MORNINGSTAR_COMMAND_REGISTRY = new CommandRegistry(MORNINGSTAR_COMMANDS);
/** Create a built-in registry with validated runtime additions. */
export function createMorningstarCommandRegistry(additions = [], options = {}) {
    return MORNINGSTAR_COMMAND_REGISTRY.merge(additions, options);
}
/** Standalone compatibility adapter for consumers that do not use class methods. */
export function toAutocompleteItems(registry, options = {}) {
    return registry.toAutocompleteItems(options);
}
/** Standalone help adapter for consumers that do not use class methods. */
export function groupCommandsForHelp(registry, options = {}) {
    return registry.groupForHelp(options);
}
//# sourceMappingURL=command-registry.js.map