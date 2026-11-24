/**
 * Stable, side-effect-free integration surface for standalone agents.
 *
 * Importing this module never starts the CLI or Telegram gateway. Consumers
 * provide their own configuration, state stores, identity and transport.
 */
export { runAgent, type AgentLifecycleEvent, type AgentRunOptions, type AgentRunResult, type ApprovalDecision, type NativeToolExecFn, type StreamFn, type TextToolExecFn, type ToolApprovalRequest, type ToolApprovalResponse, type ToolInvocation, } from "./agent-runner.js";
export { streamChat } from "./ai.js";
export { executeNativeToolCall, executeToolCall, fetchUrl, parseToolCalls, webSearch, type ParsedToolCall, } from "./tools.js";
export { detectProvider, getModelDisplayName, getProviderApiKeyEnv, getProviderBaseUrl, listInstalledOllamaModels, listProviders, refreshInstalledOllamaModels, type ProviderCatalogEntry, type StreamToken, type UsageData, } from "./providers.js";
export { createResilientStream, pickModelChain, } from "./model-fallback.js";
export { decidePermission, type Decision, type PolicyVerdict, type Risk, } from "./policy-engine.js";
export type { CLIConfig, Message, MessageToolCall, ToolResult, } from "./types.js";
export { runSwarm, prepareSwarmPlan, validateSwarmPlan, type SwarmPlan, type SwarmTask, type SwarmOptions } from "./swarm.js";
//# sourceMappingURL=headless.d.ts.map