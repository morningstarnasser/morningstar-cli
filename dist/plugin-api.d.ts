import type { Agent } from "./agents.js";
import type { Skill } from "./skills.js";
import type { Rule } from "./rules.js";
import type { HookConfig, HookEvent } from "./hooks-system.js";
import type { ToolResult } from "./types.js";
export interface PluginToolDefinition {
    name: string;
    description: string;
    execute: (args: string, cwd: string) => ToolResult | Promise<ToolResult>;
}
export interface PluginContext {
    cwd: string;
    model: string;
    provider: string;
}
export interface MorningstarPluginAPI {
    /**
     * Register a custom tool.
     */
    registerTool(tool: PluginToolDefinition): void;
    /**
     * Register a custom agent.
     */
    registerAgent(id: string, agent: Agent): void;
    /**
     * Register a skill.
     */
    registerSkill(skill: Skill): void;
    /**
     * Register a rule.
     */
    registerRule(rule: Rule): void;
    /**
     * Register a hook.
     */
    registerHook(event: HookEvent, hook: HookConfig): void;
    /**
     * Register a slash command.
     */
    registerCommand(name: string, description: string, handler: (args: string) => void | Promise<void>): void;
    /**
     * Get the current plugin context.
     */
    getContext(): PluginContext;
    /**
     * Log a message from the plugin.
     */
    log(message: string): void;
}
export declare function getRegisteredTools(): PluginToolDefinition[];
export declare function getRegisteredAgents(): Record<string, Agent>;
export declare function getRegisteredSkills(): Skill[];
export declare function getRegisteredRules(): Rule[];
export declare function getRegisteredHooks(): Record<string, HookConfig[]>;
export declare function getRegisteredCommands(): Record<string, {
    description: string;
    handler: (args: string) => void | Promise<void>;
}>;
/**
 * Create a plugin API instance for a given context.
 */
export declare function createPluginAPI(context: PluginContext): MorningstarPluginAPI;
/**
 * Clear all registered plugins (for testing/reload).
 */
export declare function clearPluginRegistry(): void;
//# sourceMappingURL=plugin-api.d.ts.map