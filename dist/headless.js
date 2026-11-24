/**
 * Stable, side-effect-free integration surface for standalone agents.
 *
 * Importing this module never starts the CLI or Telegram gateway. Consumers
 * provide their own configuration, state stores, identity and transport.
 */
export { runAgent, } from "./agent-runner.js";
export { streamChat } from "./ai.js";
export { executeNativeToolCall, executeToolCall, fetchUrl, parseToolCalls, webSearch, } from "./tools.js";
export { detectProvider, getModelDisplayName, getProviderApiKeyEnv, getProviderBaseUrl, listInstalledOllamaModels, listProviders, refreshInstalledOllamaModels, } from "./providers.js";
export { createResilientStream, pickModelChain, } from "./model-fallback.js";
export { decidePermission, } from "./policy-engine.js";
export { runSwarm, prepareSwarmPlan, validateSwarmPlan } from "./swarm.js";
//# sourceMappingURL=headless.js.map