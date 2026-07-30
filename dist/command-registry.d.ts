/**
 * Typed slash-command metadata and discovery.
 *
 * The registry deliberately contains no UI or command-handler code. This keeps
 * validation, dynamic command discovery, autocomplete, and help generation
 * deterministic and easy to test.
 */
export declare const COMMAND_CATEGORIES: readonly [{
    readonly id: "general";
    readonly title: "Allgemein";
}, {
    readonly id: "ai";
    readonly title: "AI & Model";
}, {
    readonly id: "agents";
    readonly title: "Agenten & Delegation";
}, {
    readonly id: "skills";
    readonly title: "Skills & Rules";
}, {
    readonly id: "teams";
    readonly title: "Agent Teams";
}, {
    readonly id: "memory";
    readonly title: "Notizen & Aufgaben";
}, {
    readonly id: "git";
    readonly title: "Git & Checkpoints";
}, {
    readonly id: "analysis";
    readonly title: "Codebase-Analyse";
}, {
    readonly id: "project";
    readonly title: "Dateien & Projekt";
}, {
    readonly id: "sessions";
    readonly title: "History & Sessions";
}, {
    readonly id: "media";
    readonly title: "Vision & Bilder";
}, {
    readonly id: "modes";
    readonly title: "Darstellung & Modes";
}, {
    readonly id: "integrations";
    readonly title: "Plugins & Integrationen";
}, {
    readonly id: "system";
    readonly title: "System & Learning";
}, {
    readonly id: "custom";
    readonly title: "Custom Commands";
}];
export type CommandCategory = (typeof COMMAND_CATEGORIES)[number]["id"];
export type CommandBehavior = "immediate" | "prompt";
export type CommandBusyBehavior = "run" | "queue";
export interface CommandAvailabilityContext {
    /**
     * Optional runtime capabilities. Planned commands use these gates so they
     * remain resolvable metadata without being advertised before a handler exists.
     */
    readonly capabilities?: ReadonlySet<string>;
}
export type CommandAvailabilityPredicate<Context = CommandAvailabilityContext> = (context: Context | undefined) => boolean;
export interface CommandDefinition<Context = CommandAvailabilityContext> {
    /** Stable identity used when replacing dynamically supplied metadata. */
    readonly id: string;
    /** Invocation without the leading slash, for example `memory add`. */
    readonly name: string;
    /** Alternative invocations, also without a leading slash. */
    readonly aliases?: readonly string[];
    readonly category: CommandCategory;
    readonly description: string;
    /** Human-facing syntax, including the leading slash and argument placeholders. */
    readonly usage: string;
    /** Fixed local handler or prompt-backed workflow. */
    readonly behavior: CommandBehavior;
    /** Whether submission is allowed during an active turn or queued behind it. */
    readonly whenBusy: CommandBusyBehavior;
    readonly isAvailable?: CommandAvailabilityPredicate<Context>;
    readonly hidden?: boolean;
    /** A reason string is preferred when the replacement is known. */
    readonly deprecated?: boolean | string;
}
export type CommandValidationIssueCode = "invalid-id" | "invalid-name" | "invalid-alias" | "invalid-category" | "invalid-description" | "invalid-usage" | "invalid-behavior" | "invalid-busy-behavior" | "invalid-availability" | "invalid-deprecation" | "duplicate-id" | "duplicate-name" | "duplicate-alias" | "self-alias" | "name-alias-collision" | "alias-collision";
export interface CommandValidationIssue {
    readonly code: CommandValidationIssueCode;
    readonly commandId: string;
    readonly value: string;
    readonly conflictsWith?: string;
    readonly message: string;
}
/** Thrown when command metadata is malformed or names are ambiguous. */
export declare class CommandRegistryValidationError extends Error {
    readonly issues: readonly CommandValidationIssue[];
    constructor(issues: readonly CommandValidationIssue[]);
}
export interface CommandVisibilityOptions<Context = CommandAvailabilityContext> {
    readonly context?: Context;
    readonly includeHidden?: boolean;
    readonly includeDeprecated?: boolean;
    readonly includeUnavailable?: boolean;
}
export interface CommandAutocompleteOptions<Context = CommandAvailabilityContext> extends CommandVisibilityOptions<Context> {
    readonly prefix?: string;
    readonly includeAliases?: boolean;
}
export interface CommandHelpGroup<Context = CommandAvailabilityContext> {
    readonly category: CommandCategory;
    readonly title: string;
    readonly commands: readonly CommandDefinition<Context>[];
}
export interface LegacyAutocompleteItem {
    readonly cmd: string;
    readonly desc: string;
}
export interface ResolvedCommand<Context = CommandAvailabilityContext> {
    readonly command: CommandDefinition<Context>;
    readonly invokedAs: string;
    readonly args: string;
    readonly isAlias: boolean;
}
export interface CommandMergeOptions {
    /**
     * Replace existing entries with the same stable id. Name and alias collisions
     * with every other command still fail validation.
     */
    readonly replaceById?: boolean;
}
/** Normalize a command or alias for case-insensitive lookup. */
export declare function normalizeCommandName(value: string): string;
/**
 * Return every validation issue instead of failing at the first collision.
 * Collision checks are case-insensitive and independent of declaration order.
 */
export declare function validateCommandDefinitions<Context>(definitions: readonly CommandDefinition<Context>[]): readonly CommandValidationIssue[];
/**
 * Immutable command registry. `merge` returns a new validated instance, making
 * runtime additions safe to assemble from custom commands, agents, and models.
 */
export declare class CommandRegistry<Context = CommandAvailabilityContext> {
    private readonly commands;
    private readonly commandsById;
    private readonly bindings;
    private readonly bindingOrder;
    constructor(definitions?: readonly CommandDefinition<Context>[]);
    get size(): number;
    /** All registered definitions, including hidden, deprecated, and unavailable entries. */
    list(): readonly CommandDefinition<Context>[];
    getById(id: string): CommandDefinition<Context> | undefined;
    /** Resolve an exact canonical name or alias regardless of visibility. */
    resolve(nameOrAlias: string): CommandDefinition<Context> | undefined;
    /**
     * Resolve the longest command/alias prefix from a submitted line.
     * Hidden and unavailable commands remain resolvable so dispatch can provide a
     * precise disabled/deprecated message instead of treating them as a prompt.
     */
    resolveInput(input: string): ResolvedCommand<Context> | undefined;
    isAvailable(command: CommandDefinition<Context>, context?: Context): boolean;
    /**
     * Prefix search over canonical names and aliases. Results are de-duplicated by
     * command and ranked by exact-name, exact-alias, name-prefix, alias-prefix.
     */
    search(prefix?: string, options?: CommandVisibilityOptions<Context>): readonly CommandDefinition<Context>[];
    /** Group advertised commands into stable UI help sections. */
    groupForHelp(options?: CommandVisibilityOptions<Context>): readonly CommandHelpGroup<Context>[];
    /**
     * Compatibility adapter for the current App/Input `{cmd, desc}` contract.
     * Placeholders stay in `usage` for help; autocomplete inserts executable
     * command prefixes. Aliases are included by default so compatibility names
     * can be discovered by the existing prefix filter.
     */
    toAutocompleteItems(options?: CommandAutocompleteOptions<Context>): readonly LegacyAutocompleteItem[];
    merge(additions: readonly CommandDefinition<Context>[], options?: CommandMergeOptions): CommandRegistry<Context>;
}
/** Build an availability gate that can be enabled explicitly by an integration. */
export declare function requiresCapability(capability: string): CommandAvailabilityPredicate<CommandAvailabilityContext>;
/**
 * Built-in Morningstar surface. Subcommands are first-class metadata entries
 * because the current autocomplete supports multi-word prefixes.
 *
 * Entries whose App handler does not exist yet are capability-gated and are
 * therefore absent from autocomplete/help/search by default.
 */
export declare const MORNINGSTAR_COMMANDS: readonly CommandDefinition[];
/** Validated immutable registry for the built-in Morningstar command surface. */
export declare const MORNINGSTAR_COMMAND_REGISTRY: CommandRegistry<CommandAvailabilityContext>;
/** Create a built-in registry with validated runtime additions. */
export declare function createMorningstarCommandRegistry(additions?: readonly CommandDefinition[], options?: CommandMergeOptions): CommandRegistry;
/** Standalone compatibility adapter for consumers that do not use class methods. */
export declare function toAutocompleteItems<Context>(registry: CommandRegistry<Context>, options?: CommandAutocompleteOptions<Context>): readonly LegacyAutocompleteItem[];
/** Standalone help adapter for consumers that do not use class methods. */
export declare function groupCommandsForHelp<Context>(registry: CommandRegistry<Context>, options?: CommandVisibilityOptions<Context>): readonly CommandHelpGroup<Context>[];
//# sourceMappingURL=command-registry.d.ts.map