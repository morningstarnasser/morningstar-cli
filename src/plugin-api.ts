// ─── Plugin API ──────────────────────────────────────────
// API surface exposed to plugins for registering tools, agents, skills, and hooks

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

// ─── Registry (in-memory, populated by plugins at load time) ───

const registeredTools: PluginToolDefinition[] = [];
const registeredAgents: Record<string, Agent> = {};
const registeredSkills: Skill[] = [];
const registeredRules: Rule[] = [];
const registeredHooks: Record<string, HookConfig[]> = {};
const registeredCommands: Record<string, { description: string; handler: (args: string) => void | Promise<void> }> = {};

export function getRegisteredTools(): PluginToolDefinition[] { return [...registeredTools]; }
export function getRegisteredAgents(): Record<string, Agent> { return { ...registeredAgents }; }
export function getRegisteredSkills(): Skill[] { return [...registeredSkills]; }
export function getRegisteredRules(): Rule[] { return [...registeredRules]; }
export function getRegisteredHooks(): Record<string, HookConfig[]> { return { ...registeredHooks }; }
export function getRegisteredCommands(): Record<string, { description: string; handler: (args: string) => void | Promise<void> }> { return { ...registeredCommands }; }

/**
 * Create a plugin API instance for a given context.
 */
export function createPluginAPI(context: PluginContext): MorningstarPluginAPI {
  return {
    registerTool(tool) {
      registeredTools.push(tool);
    },
    registerAgent(id, agent) {
      registeredAgents[id] = agent;
    },
    registerSkill(skill) {
      registeredSkills.push(skill);
    },
    registerRule(rule) {
      registeredRules.push(rule);
    },
    registerHook(event, hook) {
      if (!registeredHooks[event]) registeredHooks[event] = [];
      registeredHooks[event].push(hook);
    },
    registerCommand(name, description, handler) {
      registeredCommands[name] = { description, handler };
    },
    getContext() {
      return { ...context };
    },
    log(message) {
      console.log(`[plugin] ${message}`);
    },
  };
}

/**
 * Clear all registered plugins (for testing/reload).
 */
export function clearPluginRegistry(): void {
  registeredTools.length = 0;
  Object.keys(registeredAgents).forEach(k => delete registeredAgents[k]);
  registeredSkills.length = 0;
  registeredRules.length = 0;
  Object.keys(registeredHooks).forEach(k => delete registeredHooks[k]);
  Object.keys(registeredCommands).forEach(k => delete registeredCommands[k]);
}
