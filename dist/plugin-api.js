// ─── Plugin API ──────────────────────────────────────────
// API surface exposed to plugins for registering tools, agents, skills, and hooks
// ─── Registry (in-memory, populated by plugins at load time) ───
const registeredTools = [];
const registeredAgents = {};
const registeredSkills = [];
const registeredRules = [];
const registeredHooks = {};
const registeredCommands = {};
export function getRegisteredTools() { return [...registeredTools]; }
export function getRegisteredAgents() { return { ...registeredAgents }; }
export function getRegisteredSkills() { return [...registeredSkills]; }
export function getRegisteredRules() { return [...registeredRules]; }
export function getRegisteredHooks() { return { ...registeredHooks }; }
export function getRegisteredCommands() { return { ...registeredCommands }; }
/**
 * Create a plugin API instance for a given context.
 */
export function createPluginAPI(context) {
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
            if (!registeredHooks[event])
                registeredHooks[event] = [];
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
export function clearPluginRegistry() {
    registeredTools.length = 0;
    Object.keys(registeredAgents).forEach(k => delete registeredAgents[k]);
    registeredSkills.length = 0;
    registeredRules.length = 0;
    Object.keys(registeredHooks).forEach(k => delete registeredHooks[k]);
    Object.keys(registeredCommands).forEach(k => delete registeredCommands[k]);
}
//# sourceMappingURL=plugin-api.js.map