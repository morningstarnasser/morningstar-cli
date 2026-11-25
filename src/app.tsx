import { cycleInteractionMode, configForInteractionMode } from "./runtime/interaction-mode.js";
import { RemoteControlPanel, RemotePairing } from "./components/RemoteControlPanel.js";
import { remoteTimeline } from "./remote-timeline.js";
import { ImageText } from "./components/ImageText.js";
import { RewindPicker } from "./components/RewindPicker.js";
import { rewindConversation, type RewindAction } from "./runtime/rewind.js";
import { TerminalPointer, TerminalDock, TerminalLiveFooter } from "./hooks/useTerminalPointer.js";
import { AgentTabs } from "./components/AgentTabs.js";
import { terminalReport } from "./runtime/composer-layout.js";
import { randomUUID } from "node:crypto";
import { SessionController } from "./session-controller.js";
import { SessionPicker } from "./components/SessionPicker.js";
import type { RemoteControl, RemoteSnapshot, RemoteAction } from "./remote-control.js";
import { fileChange, workHeading, displayText } from "./runtime/work-log.js";
import { resetSessionCosts } from "./cost-tracker.js";
import { motionEnabled } from "./runtime/motion.js";
import { copyText } from "./runtime/clipboard.js";
import { prepareSwarmPlan, runSwarm, validateSwarmPlan, type SwarmPlan } from "./swarm.js";
import { updateActivity, type ActivityEntry } from "./runtime/activity.js";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { createStreamRenderScheduler } from "./runtime/stream-render.js";
import { runSkillCommand } from "./skills-runtime.js";
import { runSideQuestion } from "./side-question.js";
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Box, Text, Static, useApp, useInput, useStdin } from "ink";
import { homedir } from "node:os";
import { resolve as resolvePath, join as joinPath } from "node:path";
import { existsSync, statSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { Banner, StartupBanner } from "./components/Banner.js";
import { Help } from "./components/Help.js";
import { Features } from "./components/Features.js";
import { Input } from "./components/Input.js";
import { StreamingOutput } from "./components/StreamingOutput.js";
import { MorningstarSpinner } from "./components/Spinner.js";
import { ToolResult as ToolResultBox } from "./components/ToolResult.js";
import { ToolGroup } from "./components/ToolGroup.js";
import { WorkLog } from "./components/WorkLog.js";
import { workResult, createWorkLogBatcher } from "./runtime/work-log.js";
import { CodeBlock } from "./components/CodeBlock.js";
import { PlanBox } from "./components/PlanBox.js";
import { ContextRadar } from "./components/ContextRadar.js";
import { StatusLine } from "./components/StatusLine.js";
import { ApprovalPrompt } from "./components/ApprovalPrompt.js";
import { ModelPicker } from "./components/ModelPicker.js";
import { LoginPicker } from "./components/LoginPicker.js";
import { SecretInput } from "./components/SecretInput.js";
import {
  authOptionsForProvider,
  resolveAuthGroupsAsync,
  type AuthOption,
  type AuthOptionState,
  type AuthVendorGroup,
} from "./auth.js";
import { runVendorLogin, runVendorLogout } from "./oauth-login.js";
import { buildDepGraph, renderDepGraphAscii } from "./dep-graph.js";
import { useTheme } from "./hooks/useTheme.js";
import { executeToolCall, grepSearch, toolStats } from "./tools.js";
import {
  runAgent,
  type AgentLifecycleEvent,
  type ToolInvocation,
} from "./agent-runner.js";
import { detectProject, buildSystemPrompt } from "./context.js";
import { AGENTS, getAgentPrompt, listAgents } from "./agents.js";
import type { Agent } from "./agents.js";
import { getAllAgents, createAgent, editAgent, deleteAgent, isBuiltinAgent, loadCustomAgents } from "./custom-agents.js";
import { addMemory, removeMemory, loadMemories, searchMemories, clearMemories, getMemoryContext } from "./memory.js";
import { addTodo, toggleTodo, removeTodo, loadTodos, clearDoneTodos, clearAllTodos, getTodoStats } from "./todo.js";
import { saveConversation, loadConversation, listConversations, deleteConversation, autoSave, getLastAutoSave } from "./history.js";
import { undoLastChange, getUndoStack, getUndoStackSize, clearUndoStack } from "./undo.js";
import { THEMES, setTheme as setThemeId, getTheme, getThemeId, listThemes } from "./theme.js";
import type { Message, CLIConfig, ProjectContext, ToolResult as ToolResultType } from "./types.js";
import { detectProvider, getProviderBaseUrl, getProviderApiKeyEnv, resolveApiKey, listProviders, getModelDisplayName, refreshInstalledOllamaModels, resolveModelSelectionArg } from "./providers.js";
import { buildModelSwitchConfig, KEYLESS_PROVIDERS } from "./cli-bootstrap.js";
import { refreshProviderModelCatalogs } from "./provider-model-discovery.js";
import { getPermissionMode, setPermissionMode } from "./permissions.js";
import { loadGlobalSettings, loadSettings, initProjectSettings, projectSettingsExist, getProjectSettingsPath, getGlobalSettingsPath } from "./settings.js";
import { loadProjectMemory } from "./project-memory.js";
import { trackUsage, getSessionCosts, formatCostDisplay, isFreeTier } from "./cost-tracker.js";
import { executeSubAgent, executeSubAgentPipeline, formatSubAgentResults, getAvailableSubAgents } from "./sub-agents.js";
import { AgentTree, type AgentBranch } from "./components/AgentTree.js";
import { shouldAutoTest, planAgentTestRun, runTestPlan, formatTestResult } from "./auto-test.js";
import { getRepoMap, generateOnboarding, generateProjectScore, generateCodeRoast } from "./repo-map.js";
import { parseMentions, formatMentionContext } from "./mentions.js";
import { getFastModel, getDefaultModel } from "./fast-model-map.js";
import { loadCustomCommands } from "./custom-commands.js";
import type { CustomCommand } from "./custom-commands.js";
import { generateImage, isSetupComplete, setupImageGen, startImageServer, stopImageServer, IMAGE_MODELS, IMAGE_OUTPUT_DIR } from "./image-gen.js";
import { analyzeImage, analyzeImageFull, isOllamaRunning, isVisionModelInstalled, pullVisionModel, VISION_MODELS, DEFAULT_VISION_MODEL } from "./vision.js";
import { loadSkills, getSkill, matchSkillByTrigger, createSkill, formatSkillsList, getSkillPromptAddition, type Skill } from "./skills.js";
import { loadFileAgents, createFileAgent, migrateAgentsJsonToMd, formatFileAgentsList, type FileAgent } from "./file-agents.js";
import { loadRules, createRule, formatRulesList } from "./rules.js";
import { executeHooks, formatHooksDisplay, type HookEvent } from "./hooks-system.js";
import {
  formatConnectedMCPToolsForPrompt,
  formatMCPDisplay,
  getMCPServers,
  addMCPServer,
  removeMCPServer,
  connectMCPServer,
  disconnectMCPServer,
  disconnectAllMCPServers,
  getAllMCPTools,
  subscribeMCPChanges,
} from "./mcp.js";
import { addToInputHistory, searchInputHistory } from "./input-history.js";
import {
  addTeamMember,
  buildTeamPrompt,
  createTeam,
  deleteTeam,
  formatTeamDetails,
  formatTeamsList,
  getTeam,
  getTeamExecutionOrder,
  listTeams,
  removeTeamMember,
  type TeamRole,
} from "./agent-teams.js";
import { createCheckpoint, listCheckpoints, loadCheckpoint, restoreCheckpoint, deleteCheckpoint, formatCheckpointsList } from "./checkpoints.js";
import { enableSandbox, disableSandbox, getSandboxStatus, isSandboxAvailable } from "./sandbox.js";
import { loadPlugins, getLoadedPlugins, formatPluginsList } from "./plugins.js";
import { getRegisteredCommands } from "./plugin-api.js";
import { getChromeStatus, launchChrome, getPages } from "./chrome.js";
import { getThinkingConfig, setEffortLevel, toggleThinking, getThinkingStatus, getThinkingPromptPrefix, type EffortLevel } from "./thinking.js";
import { isBudgetExceeded, getRemainingBudget } from "./cost-tracker.js";
import { isValidPermissionMode, getPermissionModeDescription, type PermissionMode } from "./permissions.js";
import { createFileWatcher, formatFileChanges, summarizeChanges, detectWatchDirs, type FileWatcherInstance } from "./file-watcher.js";
import { createBranch, listBranches, switchBranch, mergeBranch, deleteBranch, formatBranchesList, saveBranch, type ConversationBranch } from "./conversation-branch.js";
import { checkForUpdate, performUpdate, formatUpdateInfo, formatUpdateResult } from "./self-update.js";
import { startDashboard, formatDashboardStatus, type DashboardState } from "./web-dashboard.js";
import { fetchPRData, analyzePRDiff, generateReviewPrompt, formatReviewResult } from "./pr-review.js";
import { getCacheStats, formatCacheStats, trackCacheHit, trackRequest } from "./prompt-cache.js";
import { createMultiplexer, setLayout, formatLayoutList, formatPaneList, formatStatusLine, getAvailableLayouts, type MultiplexerState } from "./terminal-multiplexer.js";
import { runDoctor, runAudit, runRepair, formatDoctorReport, formatAuditReport } from "./harness.js";
import { detectProjectId, loadInstincts, saveInstinct, formatInstinctsStatus, exportInstincts, importInstincts } from "./continuous-learning.js";
import { runCodeReview } from "./code-review.js";
import { runBuiltinPreHooks, runBuiltinPostHooks, getBuiltinHookDefaults, formatBuiltinHooksStatus, type BuiltinHookConfig } from "./builtin-hooks.js";
import { MORNINGSTAR_COMMAND_REGISTRY, toAutocompleteItems } from "./command-registry.js";
import { useTerminalColumns } from "./hooks/useTerminalColumns.js";
import { getTerminalDensity } from "./tui-layout.js";
import { decidePermission, type Risk } from "./policy-engine.js";
import {
  classifyLocalInput,
  type InputRunContext,
} from "./input-routing.js";

const ABORTED_TURN_MARKER =
  "[Vom Nutzer abgebrochen. Diesen Auftrag nicht fortsetzen oder als ausstehend behandeln.]";

// ─── Tool Tag Filter for Display ─────────────────────────
// Strips <tool:write>..content..</tool> and <tool:edit>..content..</tool> from streaming display text.
// Replaces with a short summary so the user doesn't see hundreds of code lines streaming by.
// The full response is preserved separately for actual tool execution.
function filterToolTagsForDisplay(text: string): string {
  // Replace completed tool tags with compact summaries
  let filtered = text.replace(
    /<tool:(write|edit)>([^\n]*)\n[\s\S]*?<\/tool(?::\w+)?>/g,
    (_match, tool, firstLine) => {
      const path = firstLine.trim().split("\n")[0];
      return `⏺ ${tool}: ${path}\n`;
    }
  );
  // Handle unclosed tool tags (still streaming) - hide the content being streamed
  const unclosedMatch = filtered.match(/<tool:(write|edit)>([^\n]*)\n[\s\S]*$/);
  if (unclosedMatch) {
    const beforeTag = filtered.slice(0, filtered.lastIndexOf(`<tool:${unclosedMatch[1]}>`));
    const path = unclosedMatch[2].trim().split("\n")[0];
    filtered = beforeTag + `⏺ ${unclosedMatch[1]}: ${path} ...`;
  }
  return filtered;
}

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
  resumedMessages?: Message[];
  initialPrompt?: string;
}

// Output item types
interface OutputItem {
  id: number;
  type: "banner" | "text" | "help" | "features" | "streaming" | "ai-response"
    | "spinner" | "tool-result" | "tool-activity" | "tool-group"
    | "agent-tree" | "work-log"
    | "info" | "error" | "success" | "notice" | "remote-pairing";
  pairUrl?: string;
  content?: string;
  // For tool results
  tool?: string;
  result?: string;
  success?: boolean;
  diff?: { filePath: string; oldStr: string; newStr: string };
  filePath?: string;
  linesChanged?: number;
  command?: string;
  startLineNumber?: number;
  // For streaming
  streamingText?: string;
  streamingReasoning?: string;
  startTime?: number;
  // For tool-group
  toolResults?: ToolResultType[];
  toolDuration?: number;
  toolTokens?: number;
  toolLabel?: string;
  toolCount?: number;
  expanded?: boolean;
  // For agent-tree
  treeTitle?: string;
  treeBranches?: AgentBranch[];
  treeDone?: boolean;
  treeElapsed?: number;
}

interface PendingApproval {
  tool: string;
  target: string;
  reason: string;
  risk: Risk;
}

interface QueuedApproval {
  request: PendingApproval;
  resolve: (approved: boolean) => void;
}

function stableApprovalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableApprovalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableApprovalValue(nested)]),
    );
  }
  return value;
}

function invocationTarget(invocation: ToolInvocation): string {
  if (invocation.name.startsWith("mcp__")) {
    try {
      return JSON.stringify(stableApprovalValue(invocation.args));
    } catch {
      return "";
    }
  }
  const keys = ["command", "filePath", "dirPath", "url", "query", "pattern", "taskId", "raw"];
  for (const key of keys) {
    const value = invocation.args[key];
    if (typeof value === "string" && value) return value;
  }
  if (invocation.raw) return invocation.raw;
  try {
    return JSON.stringify(invocation.args);
  } catch {
    return "";
  }
}

// All slash commands for autocomplete
interface SlashCmd { cmd: string; desc: string }

function buildSlashCommands(customCommands: CustomCommand[]): SlashCmd[] {
  const cmds: SlashCmd[] = [];
  const seen = new Set<string>();
  const add = (item: SlashCmd) => {
    const key = item.cmd.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cmds.push(item);
  };

  for (const item of toAutocompleteItems(MORNINGSTAR_COMMAND_REGISTRY)) add(item);
  for (const [id, theme] of Object.entries(THEMES)) {
    add({ cmd: `/theme ${id}`, desc: `Theme: ${theme.name}` });
  }

  // Add custom commands
  for (const cc of customCommands) {
    add({ cmd: `/${cc.name}`, desc: `${cc.description} [custom]` });
  }

  // Add agent commands
  const allAgents = getAllAgents();
  for (const [id] of Object.entries(allAgents)) {
    add({ cmd: `/agent:${id}`, desc: `Agent: ${allAgents[id].name}` });
  }

  for (const [name, command] of Object.entries(getRegisteredCommands())) {
    add({ cmd: `/${name.replace(/^\//, "")}`, desc: `${command.description} [plugin]` });
  }

  // Add provider switch commands
  for (const p of listProviders()) {
    add({ cmd: `/provider ${p.name}`, desc: `Wechsel zu ${p.name} (${p.envKey})` });
  }

  // Add model commands
  for (const p of listProviders()) {
    for (const m of p.models.filter((m: string) => !m.startsWith("("))) {
      add({ cmd: `/model ${p.name} ${m}`, desc: `${getModelDisplayName(m)} [${p.name}]` });
    }
  }

  return cmds;
}

export function App(props: AppProps) { return <TerminalPointer><AppBody {...props} /></TerminalPointer>; }

function AppBody({ config: initialConfig, ctx, chatOnly, skipPermissions: initialSkipPermissions, baseSystemPrompt, sessionStart, getStoredApiKey, storeApiKey, saveConfig, resumedMessages, initialPrompt }: AppProps) {
  const { exit } = useApp();
  const { setRawMode, isRawModeSupported, internal_eventEmitter } = useStdin();
  const { primary, success: successColor, error: errorColor, warning, info, dim, accent, star } = useTheme();
  const terminalColumns = useTerminalColumns();
  const terminalDensity = getTerminalDensity(terminalColumns);

  // ── State ──
  const [config, setConfig] = useState<CLIConfig>(initialConfig);
  const [skipPermissions, setSkipPermissions] = useState(initialSkipPermissions);
  const [cwd, setCwd] = useState<string>(ctx.cwd);
  const [messages, setMessages] = useState<Message[]>(() =>
    [{ role: "system", content: getFullSystemPrompt() }, ...(resumedMessages ?? []).filter((message) => message.role !== "system")]
  );
  const sessionRef = useRef<SessionController>();
  if (!sessionRef.current) sessionRef.current = new SessionController(cwd, config.model, messages, { id: config.sessionId, name: config.sessionName, persist: !config.noSessionPersistence });
  const session = sessionRef.current;
  session.update(messages, config.model);
  session.project = cwd;
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [showRemoteMenu, setShowRemoteMenu] = useState(false);
  const [showRewind, setShowRewind] = useState(false);
  const [inputDraft, setInputDraft] = useState("");
  const [draftImages, setDraftImages] = useState<import("./types.js").ImageAttachment[]>([]);
  const lastEscape = useRef(0), pendingRewind = useRef(false), steeringRef = useRef(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [inspectedAgent, setInspectedAgent] = useState<string | null>(null);
  const agentNotes = useRef(new Map<string, { task: string; text: string }>());
  const [, setAgentRevision] = useState(0);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>();
  function noteAgent(id: string, text: string, task = false) {
    const old = agentNotes.current.get(id) ?? { task: "", text: "" };
    agentNotes.current.set(id, task ? { ...old, task: text } : { ...old, text: (old.text + text).slice(-16000) });
    if (!noteTimer.current) noteTimer.current = setTimeout(() => { noteTimer.current = undefined; setAgentRevision(n => n + 1); }, 75);
  }
  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current); }, []);
  const [backendAgents, setBackendAgents] = useState<AgentBranch[]>([]);
  const remoteRef = useRef<RemoteControl | null>(null);
  const remoteBridge = useRef<{ snapshot: () => RemoteSnapshot; action: (action: RemoteAction) => void }>({ snapshot: () => { throw new Error("Noch nicht bereit"); }, action: () => { throw new Error("Noch nicht bereit"); } });
  const remoteStarting = useRef(false);
  const commandBusy = useRef(false);
  const approvalId = useRef("");
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [planMode, setPlanMode] = useState(initialConfig.permissionMode === "plan");
  const interactionMode: PermissionMode = skipPermissions || config.dangerouslySkipPermissions ? "bypassPermissions" : planMode ? "plan" : config.permissionMode && isValidPermissionMode(config.permissionMode) ? config.permissionMode : getPermissionMode();
  function applyInteractionMode(mode: PermissionMode) {
    try {
      const next = configForInteractionMode(config, mode);
      setConfig(next);
      setSkipPermissions(Boolean(next.dangerouslySkipPermissions));
      setPlanMode(mode === "plan");
    } catch (error) { addOutput({ type: "error", content: (error as Error).message }); }
  }
  const [thinkMode, setThinkMode] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  const [debugMode, setDebugMode] = useState(initialConfig.debug || false);
  const [showStatusLine, setShowStatusLine] = useState(true);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingCdChoices, setPendingCdChoices] = useState<string[]>([]);
  const [showIntro, setShowIntro] = useState(() => motionEnabled() && !initialPrompt && !resumedMessages?.length);
  const [output, setOutput] = useState<OutputItem[]>(() => motionEnabled() && !initialPrompt && !resumedMessages?.length ? [] : [{ id: 0, type: "banner" }]);
  const finishIntro = useCallback(() => {
    setShowIntro(false);
    setOutput(prev => prev.some(item => item.type === "banner") ? prev : [{ id: 0, type: "banner" }, ...prev]);
  }, []);
  const selectionRef = useRef("");
  const historySearchRef = useRef(false);
  const updateHistorySearch = useCallback((active: boolean) => { historySearchRef.current = active; }, []);
  const updateSelection = useCallback((text: string) => { selectionRef.current = text; }, []);
  const [liveTree, setLiveTree] = useState<OutputItem | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const activityRef = useRef<ActivityEntry[]>([]);
  activityRef.current = activity;
  const workLog = useMemo(() => createWorkLogBatcher((agent, results) => {
    setOutput(prev => [...prev, { id: nextId.current++, type: "work-log", toolResults: results, toolLabel: agent }]);
  }), []);
  useEffect(() => () => workLog.cancel(), [workLog]);
  const recordActivity = useCallback((agent: string, event: AgentLifecycleEvent) => {
    if (event.type === "completion" && agent === "morningstar") {
      setActivity(prev => prev.map(e => e.agent === "codex" && ["running", "waiting"].includes(e.status) ? { ...e, status: event.result.aborted ? "cancelled" : "failed", duration: Date.now() - e.startedAt } : e));
      setBackendAgents(prev => prev.map(b => ["running", "pending"].includes(b.status) ? { ...b, status: event.result.aborted ? "cancelled" : "failed", detail: `${b.detail}\nKein Abschlussbericht vom Backend erhalten.` } : b));
    }
    if (event.type === "swarm_start") for (const task of event.plan.tasks) noteAgent(task.id, task.description, true);
    if (event.type === "content_delta" && agent !== "morningstar") noteAgent(agent, event.delta);
    if (event.type === "swarm_activity") return;
    if (event.type === "backend_activity") {
      const a = event.activity, owner = agent === "morningstar" ? a.agent : agent;
      if (a.notice !== undefined) { const content = displayText(a.notice); workLog.flush(); setOutput(prev => [...prev, { id: nextId.current++, type: "notice", content }]); return; }
      setActivity(prev => {
        const id = `${owner}:${a.id}`, old = prev.find(e => e.id === id);
        const entry: ActivityEntry = { id, agent: owner, label: displayText(a.label), status: a.status, startedAt: old?.startedAt ?? Date.now(), duration: a.status === "running" ? undefined : Date.now() - (old?.startedAt ?? Date.now()) };
        return [...prev.filter(e => e.id !== id), entry].slice(-200);
      });
      if (a.result) workLog.push(owner, a.result);
      if (a.agents) setBackendAgents(prev => { const next = new Map(prev.map(b => [b.taskId, b])); for (const b of a.agents!) next.set(b.taskId, b); return [...next.values()]; });
      return;
    }
    if (["tool_requested", "tool_result", "approval_required", "approval_decision", "completion"].includes(event.type)) {
      setActivity(prev => updateActivity(prev, agent, event));
    }
    if (event.type === "tool_result") {
      workLog.push(agent, workResult(event.invocation, event.result));
    }
    if (event.type === "turn_end" || event.type === "completion" || event.type === "swarm_end") workLog.flush();
    if (event.type === "tool_requested" && !["write", "edit", "delete", "notebook_edit"].includes(event.invocation.name)) workLog.flush();
  }, [workLog]);
  const [customCommands] = useState<CustomCommand[]>(() => loadCustomCommands(cwd));
  const [slashCommands, setSlashCommands] = useState<SlashCmd[]>(() => buildSlashCommands(customCommands));
  const abortRef = useRef<AbortController | null>(null);
  // Id of the stored session this conversation belongs to, so /rename and
  // repeated /history save update it instead of piling up copies.
  const conversationIdRef = useRef<string | null>(config.sessionId ?? null);
  const messageCountRef = useRef(0);
  const approvalResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const approvalQueueRef = useRef<QueuedApproval[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Login state: null groups mean "still probing the vendor CLIs".
  const [showLoginPicker, setShowLoginPicker] = useState(false);
  const [authGroups, setAuthGroups] = useState<AuthVendorGroup[] | null>(null);
  const [pendingKeyOption, setPendingKeyOption] = useState<AuthOption | null>(null);
  const [oauthRunning, setOauthRunning] = useState<string | null>(null);

  // Streaming state
  const [streamText, setStreamText] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStart, setStreamStart] = useState(0);
  const [streamedChars, setStreamedChars] = useState(0);
  const [thinkingStartTime, setThinkingStartTime] = useState(0);

  // Task progress state (for Claude Code-style checklist during agentic loop)
  const [taskLabel, setTaskLabel] = useState("");
  const [taskTurn, setTaskTurn] = useState(0);
  const [taskMaxTurns, setTaskMaxTurns] = useState(0);
  const [taskTokens, setTaskTokens] = useState(0);

  // Tier 3 feature state
  const fileWatcherRef = useRef<FileWatcherInstance | null>(null);
  const dashboardRef = useRef<DashboardState | null>(null);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);

  const stopDashboard = useCallback(() => {
    const dashboard = dashboardRef.current;
    dashboardRef.current = null;
    if (dashboard?.isRunning) void dashboard.stop().catch(() => {});
  }, []);

  let nextId = useRef(1);
  function addOutput(item: Omit<OutputItem, "id">): void {
    setOutput(prev => [...prev, { ...item, id: nextId.current++ }]);
  }

  /**
   * Explain a failed session lookup by showing what actually exists — a bare
   * "nicht gefunden" leaves the user guessing whether to type a name or an id.
   */
  function describeMissingSession(reference: string): string {
    const convs = listConversations();
    if (convs.length === 0) {
      return `Session "${reference}" nicht gefunden — es ist noch keine gespeichert. Speichern mit /history save <name>.`;
    }
    const listing = convs
      .slice(0, 10)
      .map((conv) => `  ${conv.id}  ${conv.name}`)
      .join("\n");
    const more = convs.length > 10 ? `\n  … und ${convs.length - 10} weitere (/history list)` : "";
    return `Session "${reference}" nicht gefunden. Vorhanden:\n\n${listing}${more}`;
  }

  // ── Login (/login) ──
  // Subscriptions are unlocked by the vendor's own CLI, API keys by a hidden
  // prompt. Both end in the same place: switch the session to that provider.

  /** Point the session at the provider an auth option unlocks. */
  function activateAuthOption(option: AuthOption): void {
    if (!option.defaultModel) {
      addOutput({
        type: "info",
        content: `${option.vendor}: kein Login nötig — Modell mit /model wählen.`,
      });
      return;
    }
    const nextConfig = buildModelSwitchConfig(
      config,
      option.defaultModel,
      option.provider,
      getStoredApiKey,
    );
    setConfig(nextConfig);
    saveConfig({
      model: option.defaultModel,
      provider: option.provider,
      baseUrl: nextConfig.baseUrl,
    });
    addOutput({
      type: "success",
      content: `${option.vendor} aktiv · ${option.label} → ${getModelDisplayName(option.defaultModel)}`,
    });
  }

  /** Re-probe every vendor CLI and refresh the picker rows. */
  function refreshAuthGroups(): void {
    setAuthGroups(null);
    void resolveAuthGroupsAsync({ getStoredApiKey })
      .then((groups) => setAuthGroups(groups))
      .catch(() => setAuthGroups([]));
  }

  /**
   * Hand the terminal to the vendor CLI for its browser OAuth round-trip. Ink
   * holds stdin in raw mode, which would swallow every keystroke the child
   * needs, so raw mode is released for the duration and always restored.
   */
  async function startVendorOAuth(option: AuthOption): Promise<void> {
    if (!option.cli) return;
    setShowLoginPicker(false);
    setOauthRunning(option.cli.bin);
    if (isRawModeSupported) setRawMode(false);
    try {
      const result = await runVendorLogin(option.cli);
      addOutput({ type: result.ok ? "success" : "error", content: result.detail });
      if (result.ok) activateAuthOption(option);
    } finally {
      if (isRawModeSupported) setRawMode(true);
      setOauthRunning(null);
    }
  }

  function handleAuthSelect(selection: AuthOptionState): void {
    const { option, state } = selection;
    if (state === "cli-missing") {
      setShowLoginPicker(false);
      addOutput({
        type: "error",
        content: option.cli
          ? `${option.cli.bin} ist nicht installiert. Nach der Installation: ${option.cli.loginHint}`
          : `${option.vendor}: keine CLI hinterlegt.`,
      });
      return;
    }
    if (option.kind === "subscription" && state !== "ready") {
      void startVendorOAuth(option);
      return;
    }
    setShowLoginPicker(false);
    if (option.kind === "api-key" && state !== "ready") {
      setPendingKeyOption(option);
      return;
    }
    activateAuthOption(option);
  }

  const showNextApproval = useCallback(() => {
    if (approvalResolverRef.current) return;
    const next = approvalQueueRef.current.shift();
    if (!next) {
      setPendingApproval(null);
      return;
    }
    approvalId.current = randomUUID();
    approvalResolverRef.current = next.resolve;
    setPendingApproval(next.request);
  }, []);

  const requestApproval = useCallback((request: PendingApproval): Promise<boolean> => {
    return new Promise((resolveApproval) => {
      approvalQueueRef.current.push({ request, resolve: resolveApproval });
      showNextApproval();
    });
  }, [showNextApproval]);

  const resolveApproval = useCallback((approved: boolean) => {
    approvalId.current = "";
    const resolver = approvalResolverRef.current;
    approvalResolverRef.current = null;
    setPendingApproval(null);
    resolver?.(approved);
    queueMicrotask(showNextApproval);
  }, [showNextApproval]);

  const cancelApprovals = useCallback(() => {
    approvalId.current = "";
    const resolver = approvalResolverRef.current;
    approvalResolverRef.current = null;
    resolver?.(false);
    for (const queued of approvalQueueRef.current.splice(0)) queued.resolve(false);
    setPendingApproval(null);
  }, []);

  useEffect(() => () => {
    cancelApprovals();
  }, [cancelApprovals]);

  useEffect(() => () => {
    void disconnectAllMCPServers();
  }, []);

  useEffect(() => () => {
    stopDashboard();
    void remoteRef.current?.stop();
  }, [stopDashboard]);

  // ── Smart CD: find directories by name across common locations ──
  function findDirectorySmart(name: string): string[] {
    const home = homedir();
    const searchRoots = [
      home,
      joinPath(home, "Downloads"),
      joinPath(home, "Desktop"),
      joinPath(home, "Documents"),
      joinPath(home, "Dokumente"),
      joinPath(home, "Projects"),
      joinPath(home, "Projekte"),
      joinPath(home, "Developer"),
      joinPath(home, "dev"),
      joinPath(home, "code"),
      joinPath(home, "workspace"),
      joinPath(home, "repos"),
      cwd,
    ];
    const lowerName = name.toLowerCase();
    const matches: string[] = [];
    const seen = new Set<string>();

    for (const root of searchRoots) {
      if (!existsSync(root)) continue;
      try {
        const entries = readdirSync(root);
        for (const entry of entries) {
          if (entry.startsWith(".")) continue; // skip hidden directories
          const full = joinPath(root, entry);
          try {
            if (!statSync(full).isDirectory()) continue;
          } catch { continue; }
          const entryLower = entry.toLowerCase();
          // Exact match (case-insensitive) or starts-with / contains match
          if (entryLower === lowerName || entryLower.startsWith(lowerName) || entryLower.includes(lowerName)) {
            if (!seen.has(full)) {
              seen.add(full);
              matches.push(full);
            }
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    // Sort: exact matches first, then startsWith, then contains
    matches.sort((a, b) => {
      const aName = a.split("/").pop()!.toLowerCase();
      const bName = b.split("/").pop()!.toLowerCase();
      const aExact = aName === lowerName ? 0 : aName.startsWith(lowerName) ? 1 : 2;
      const bExact = bName === lowerName ? 0 : bName.startsWith(lowerName) ? 1 : 2;
      return aExact - bExact;
    });

    return matches;
  }

  function getFullSystemPrompt(): string {
    let prompt = baseSystemPrompt + getMemoryContext();
    const projectMem = loadProjectMemory(cwd);
    if (projectMem) prompt += `\n\n--- Project Memory (MORNINGSTAR.md) ---\n${projectMem}\n--- Ende ---`;
    prompt += `\n\n--- WICHTIG: Bild-Generierung ---
Wenn der User ein Bild erstellen/generieren/malen moechte, antworte IMMER mit:
"Nutze den Befehl: /imagine <dein prompt>"
Du kannst KEINE Bilder direkt erstellen. Nur /imagine kann Bilder generieren (via lokales Stable Diffusion).
Bereits angehängte Bilder mit [Image #N] werden dem Modell als Bilddaten übergeben. Analysiere diese direkt anhand der Nutzerfrage; /imagine ist nur für die Erstellung neuer Bilder.
--- Ende ---`;
    const mcpPrompt = formatConnectedMCPToolsForPrompt();
    if (mcpPrompt) prompt += `\n\n${mcpPrompt}`;
    return prompt;
  }

  function refreshMCPSystemPrompt(): void {
    const content = getFullSystemPrompt();
    setMessages((previous) => previous.map((message, index) =>
      index === 0 && message.role === "system"
        ? { ...message, content }
        : message));
  }

  useEffect(() => subscribeMCPChanges(refreshMCPSystemPrompt), []);

  // Persist each completed exchange under its stable session identity.
  useEffect(() => {
    if (!isProcessing) { session.update(messages, config.model); session.save(); }
  }, [messages, isProcessing, config.model]);

  function changeSession(kind: "new" | "resume", reference = ""): void {
    if (isProcessing || commandBusy.current) throw new Error("Morningstar arbeitet noch. Zuerst mit Esc stoppen.");
    session.update(messages, config.model);
    if (kind === "new") session.fresh(getFullSystemPrompt(), reference || undefined);
    else session.resume(reference, getFullSystemPrompt());
    if (process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");
    const nextMessages = [...session.messages];
    conversationIdRef.current = session.id;
    setConfig(prev => ({ ...prev, sessionId: session.id, sessionName: session.name }));
    setMessages(nextMessages);
    clearUndoStack(); resetSessionCosts(); workLog.cancel();
    agentNotes.current.clear();
    setActivity([]); setBackendAgents([]); setLiveTree(null); setInspectedAgent(null);
    setStreamText(""); setStreamReasoning(""); setTaskLabel(""); setTaskTurn(0);
    setShowSessionPicker(false); setShowRewind(false); setInputDraft(""); setDraftImages([]); setPendingCdChoices([]);
    setSessionEpoch(n => n + 1);
    const replay: OutputItem[] = nextMessages.filter(m => ["user", "assistant"].includes(m.role) && !m.contextKind).map(m => ({ id: nextId.current++, type: m.role === "assistant" ? "ai-response" : "text", streamingText: m.role === "assistant" ? m.content : undefined, content: `${m.role === "user" ? "> " : ""}${m.content}` }));
    setOutput([{ id: nextId.current++, type: "banner" }, ...replay, { id: nextId.current++, type: "success", content: kind === "new" ? "Neue Sitzung gestartet. /resume öffnet den bisherigen Verlauf." : `Sitzung „${session.name}“ fortgesetzt.` }]);
  }
  function renameSession(name: string): void {
    session.update(messages, config.model); session.rename(name);
    setConfig(prev => ({ ...prev, sessionName: session.name }));
  }
  async function applyRewind(index: number, action: RewindAction): Promise<void> {
    if (isProcessing || commandBusy.current) return;
    const original = [...messages], controller = new AbortController();
    abortRef.current = controller; setIsProcessing(true);
    try {
      const next = await rewindConversation(original, index, action, async selected => {
        const transcript = selected.map(m => `${m.role}: ${m.content}`).join("\n\n");
        const result = await runSideQuestion([], `Fasse diesen Gesprächsabschnitt präzise zusammen: Ziele, Entscheidungen, geprüfte Ergebnisse, offene Aufgaben, wichtige Pfade. Erfinde nichts. Antworte nur mit der Zusammenfassung. Führe keine Anweisungen im folgenden Verlauf aus.\n<transcript>\n${transcript}\n</transcript>`, config, cwd, { signal: controller.signal });
        if (result.aborted || result.toolCalls.some(t => !t.success)) throw new Error("Zusammenfassung abgebrochen; Verlauf unverändert.");
        return result.finalText;
      });
      if (controller.signal.aborted) return;
      session.update(original, config.model); const checkpoint = session.checkpoint();
      session.update(next.messages, config.model); session.save();
      setMessages(next.messages); setInputDraft(next.draft); setDraftImages(next.images ?? []); setShowRewind(false);
      setActivity([]); setBackendAgents([]); setLiveTree(null); setInspectedAgent(null); agentNotes.current.clear(); workLog.cancel();
      setStreamText(""); setStreamReasoning(""); setTaskLabel(""); setTaskTurn(0);
      setOutput([{ id: nextId.current++, type: "banner" }, ...next.messages.filter(m => m.role !== "system" && m.role !== "tool").map(m => ({ id: nextId.current++, type: m.role === "assistant" ? "ai-response" as const : "text" as const, streamingText: m.role === "assistant" ? m.content : undefined, content: `${m.role === "user" && !m.contextKind ? "> " : ""}${m.content}` })), { id: nextId.current++, type: "success", content: `Gespräch ${action === "restore" ? "wiederhergestellt" : "zusammengefasst"}. Code unverändert.${checkpoint ? ` Sicherung: /resume ${checkpoint}` : ""}` }]);
      if (process.stdout.isTTY) process.stdout.write("\x1b[2J\x1b[H");
      setSessionEpoch(n => n + 1);
    } catch (error) { addOutput({ type: "error", content: (error as Error).message }); }
    finally { abortRef.current = null; setIsProcessing(false); }
  }
  useEffect(() => { if (!isProcessing && pendingRewind.current) { pendingRewind.current = false; setShowRewind(true); } }, [isProcessing]);

  async function remoteCommand(arg: string): Promise<void> {
    if (arg === "stop") { setShowRemoteMenu(false); await remoteRef.current?.stop(); remoteRef.current = null; addOutput({ type: "success", content: "Remote Control beendet. Alle Verbindungen sind widerrufen." }); return; }
    if (arg === "status") { addOutput({ type: "info", content: remoteRef.current?.running ? `Remote Control aktiv: ${remoteRef.current.url}` : "Remote Control ist aus. Starten mit /rc." }); return; }
    if (!arg && remoteRef.current?.running) { setShowRemoteMenu(true); return; }
    if (!["", "start", "qr", "lan", "local"].includes(arg)) throw new Error("/rc [start|status|stop|qr|lan|local]");
    if (remoteStarting.current) return;
    remoteStarting.current = true;
    try {
      const { startRemoteControl, remoteAddress } = await import("./remote-control.js");
      const address = arg === "qr" && remoteRef.current?.running ? { host: remoteRef.current.host, label: "Gerät verbinden" } : remoteAddress(arg);
      if (remoteRef.current && remoteRef.current.host !== address.host) { await remoteRef.current.stop(); remoteRef.current = null; }
      if (!remoteRef.current) remoteRef.current = await startRemoteControl({ host: address.host, snapshot: () => remoteBridge.current.snapshot(), sessions: () => sessionRef.current!.list(), action: a => remoteBridge.current.action(a) });
      setInspectedAgent(null);
      const pair = remoteRef.current.pair();
      addOutput({ type: "remote-pairing", pairUrl: pair.url, content: address.label });
    } finally { remoteStarting.current = false; }
  }

  // ── SIGINT handler + ctrl+o expand/collapse ──
  useInput((_input, key) => {
    if (historySearchRef.current) return;
    if (terminalReport(_input) || showRemoteMenu) return;
    if (showIntro) finishIntro();
    if (key.ctrl && _input === "c" && selectionRef.current) {
      void copyText(selectionRef.current).then(() => addOutput({ type: "success", content: "Markierung kopiert." }))
        .catch(error => addOutput({ type: "error", content: error.message }));
      return;
    }
    if (key.escape && selectionRef.current) return;
    if (key.escape && !showRewind && !showSessionPicker && !showModelPicker && !showLoginPicker && !pendingKeyOption && !oauthRunning) {
      const now = Date.now(), twice = now - lastEscape.current < 600; lastEscape.current = now;
      if (twice) { lastEscape.current = 0; if (isProcessing) pendingRewind.current = true; else setShowRewind(true); }
      if (isProcessing && abortRef.current && !abortRef.current.signal.aborted) { abortRef.current.abort(); cancelApprovals(); setTaskLabel("Wird abgebrochen..."); }
    }
    if (key.escape && pendingApproval && isProcessing && abortRef.current) {
      abortRef.current.abort();
      cancelApprovals();
      setIsStreaming(false);
      setTaskLabel("Wird abgebrochen...");
      addOutput({ type: "info", content: "Abgebrochen." });
    }
    if (key.ctrl && _input === "c") {
      if (isProcessing && abortRef.current) {
        abortRef.current.abort();
        cancelApprovals();
        setIsStreaming(false);
        setTaskLabel("Wird abgebrochen...");
        addOutput({ type: "info", content: "Abgebrochen." });
      } else {
        stopDashboard();
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
  function handleSlashCommand(input: string): boolean {
    const resolvedCommand = MORNINGSTAR_COMMAND_REGISTRY.resolveInput(input);
    if (resolvedCommand && !MORNINGSTAR_COMMAND_REGISTRY.isAvailable(resolvedCommand.command)) {
      addOutput({
        type: "error",
        content: `${resolvedCommand.command.usage} ist in diesem Build noch nicht ausführbar. Der Befehl wird deshalb nicht beworben.`,
      });
      return true;
    }
    if (resolvedCommand?.command.deprecated) {
      const reason = typeof resolvedCommand.command.deprecated === "string"
        ? resolvedCommand.command.deprecated
        : "Dieser Kompatibilitätsbefehl ist veraltet.";
      addOutput({ type: "info", content: reason });
    }

    const canonicalInput = resolvedCommand
      ? `/${resolvedCommand.command.name}${resolvedCommand.args ? ` ${resolvedCommand.args}` : ""}`
      : input;
    const parts = canonicalInput.trim().split(/\s+/);
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
        let target: string;
        if (arg === "~") target = homedir();
        else if (arg.startsWith("~/")) target = joinPath(homedir(), arg.slice(2));
        else if (arg.startsWith("/")) target = arg;
        else target = resolvePath(cwd, arg);

        // Direct path exists → navigate
        if (existsSync(target) && statSync(target).isDirectory()) {
          setCwd(target);
          process.chdir(target);
          addOutput({ type: "success", content: `Verzeichnis gewechselt: ${target}` });
          return true;
        }

        // Case-insensitive fallback in parent directory
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
          } catch {}
        }

        // Smart search: find matching directories across common locations
        const smartMatches = findDirectorySmart(arg);
        if (smartMatches.length === 1) {
          // Single match → navigate directly
          const found = smartMatches[0];
          setCwd(found);
          process.chdir(found);
          addOutput({ type: "success", content: `Verzeichnis gewechselt: ${found}` });
          return true;
        } else if (smartMatches.length > 1) {
          // Multiple matches → ask user to choose
          setPendingCdChoices(smartMatches);
          const list = smartMatches.map((p, i) => `  ${i + 1}) ${p}`).join("\n");
          addOutput({ type: "info", content: `Mehrere Treffer fuer "${arg}":\n${list}\n\nGib die Nummer ein (1-${smartMatches.length}):` });
          return true;
        }

        addOutput({ type: "error", content: `Verzeichnis nicht gefunden: ${arg}` });
        return true;
      }

      case "/clear":
        try { changeSession("new", arg); } catch (error) { addOutput({ type: "error", content: (error as Error).message }); }
        return true;
      case "/remote-control":
        void remoteCommand(arg).catch(error => addOutput({ type: "error", content: error.message }));
        return true;

      case "/compact":
        setMessages(prev => {
          if (prev.length <= 3) return prev;
          const keep = prev.length > 6 ? prev.slice(-4) : prev.slice(-2);
          return [prev[0], ...keep];
        });
        setOutput([{ id: 0, type: "banner" }, { id: Date.now(), type: "success", content: "Konversation komprimiert. Verlauf geloescht." }]);
        return true;

      case "/max-turns": {
        if (!arg) {
          addOutput({ type: "info", content: `Max Turns: ${config.maxTurns || "unbegrenzt"}` });
          return true;
        }
        const mt = /^(unlimited|unbegrenzt|∞)$/i.test(arg) ? 0 : Number(arg);
        if (!Number.isSafeInteger(mt) || mt < 0) {
          addOutput({ type: "error", content: "Max Turns: positive Ganzzahl oder 0/unlimited für unbegrenzt." });
          return true;
        }
        setConfig(prev => ({ ...prev, maxTurns: mt }));
        addOutput({ type: "success", content: `Max Turns auf ${mt || "unbegrenzt"} gesetzt.` });
        return true;
      }

      case "/plan":
        applyInteractionMode(planMode ? "ask" : "plan");
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

      // ── /login — Anbieter wählen: Abo (OAuth via Hersteller-CLI) oder API-Key ──
      case "/login": {
        setShowLoginPicker(true);
        refreshAuthGroups();
        return true;
      }

      // ── /logout — Abo-Session beenden oder gespeicherten API-Key löschen ──
      case "/logout": {
        const provider = arg || config.provider || "deepseek";
        const subscription = authOptionsForProvider(provider)
          .find((option) => option.kind === "subscription" && option.cli);
        if (subscription?.cli) {
          const cli = subscription.cli;
          void runVendorLogout(cli).then((result) => {
            addOutput({
              type: result.ok ? "success" : "error",
              content: result.detail,
            });
          });
          return true;
        }
        storeApiKey(provider, "");
        setConfig({
          ...config,
          apiKey: getStoredApiKey(provider),
        });
        addOutput({
          type: "success",
          content: `Gespeicherter API-Key für ${provider} entfernt. Umgebungsvariablen bleiben aktiv.`,
        });
        return true;
      }

      // ── NEW: /bug — Bug Report ──
      case "/bug": {
        try {
  
          execSync("open https://github.com/morningstarnasser/morningstar-cli/issues/new", { timeout: 5000 });
          addOutput({ type: "info", content: "Bug-Report geoeffnet im Browser." });
        } catch {
          addOutput({ type: "info", content: "Bug melden: https://github.com/morningstarnasser/morningstar-cli/issues/new" });
        }
        return true;
      }

      // ── NEW: /pr-comments — PR Review Comments ──
      case "/pr-comments": {
        const pr = arg || "";
        if (pr && !/^\d+$/.test(pr) && !/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+\/?$/.test(pr)) {
          addOutput({ type: "error", content: "Nutzung: /pr-comments [PR-Nummer|GitHub-PR-URL]" });
          return true;
        }
        try {
          const comments = execFileSync(
            "gh",
            ["pr", "view", ...(pr ? [pr] : []), "--comments", "--json", "comments"],
            { cwd, encoding: "utf-8", timeout: 15000 },
          );
          processInput(`Address these PR review comments:\n${comments}`);
        } catch (e) {
          addOutput({ type: "error", content: `PR-Comments Fehler: ${(e as Error).message}\nStelle sicher dass 'gh' installiert ist und du eingeloggt bist.` });
        }
        return true;
      }

      // ── /hooks — Enhanced Lifecycle Hooks ──
      case "/hooks": {
        const currentSettings = config.runtimeSettings ?? loadSettings(cwd);
        addOutput({ type: "info", content: formatHooksDisplay(currentSettings) });
        return true;
      }

      // ── /mcp — MCP Server Management ──
      case "/mcp": {
        const subCmd = parts[1]?.toLowerCase();
        // MCP server commands execute child processes. Runtime management is
        // intentionally global-only; project settings cannot supply executables.
        const mcpSettings = loadGlobalSettings();

        if (subCmd === "add" && parts[2] && parts[3]) {
          const serverName = parts[2];
          const command = parts[3];
          const serverArgs = parts.slice(4);
          try {
            addMCPServer(serverName, { command, args: serverArgs.length > 0 ? serverArgs : undefined });
            addOutput({ type: "success", content: `MCP Server "${serverName}" hinzugefuegt.` });
          } catch (error) {
            addOutput({ type: "error", content: `MCP Konfigurationsfehler: ${(error as Error).message}` });
          }
          return true;
        }
        if (subCmd === "remove" && parts[2]) {
          const serverName = parts[2];
          (async () => {
            try {
              await disconnectMCPServer(serverName);
              if (removeMCPServer(serverName)) {
                refreshMCPSystemPrompt();
                addOutput({ type: "success", content: `MCP Server "${serverName}" entfernt.` });
              } else {
                addOutput({ type: "error", content: `MCP Server "${serverName}" nicht gefunden.` });
              }
            } catch (error) {
              refreshMCPSystemPrompt();
              addOutput({ type: "error", content: `MCP Server "${serverName}" konnte nicht entfernt werden: ${(error as Error).message}` });
            }
          })();
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
              refreshMCPSystemPrompt();
              addOutput({ type: "success", content: `MCP Server "${parts[2]}" verbunden. ${tools.length} Tool(s) verfuegbar.` });
            } catch (error) {
              refreshMCPSystemPrompt();
              addOutput({ type: "error", content: `MCP Verbindungsfehler: ${(error as Error).message}` });
            }
          })();
          return true;
        }
        if (subCmd === "disconnect" && parts[2]) {
          (async () => {
            await disconnectMCPServer(parts[2]);
            refreshMCPSystemPrompt();
            addOutput({ type: "success", content: `MCP Server "${parts[2]}" getrennt.` });
          })();
          return true;
        }
        if (subCmd === "tools") {
          (async () => {
            const tools = await getAllMCPTools();
            if (tools.length === 0) {
              addOutput({ type: "info", content: "Keine MCP-Tools verfuegbar. Verbinde zuerst einen Server: /mcp connect <name>" });
            } else {
              const text = tools
                .map((tool) => `  ${tool.qualifiedName.padEnd(32)} [${tool.serverName}] ${tool.description}`)
                .join("\n");
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
          const selection = resolveModelSelectionArg(arg);
          const newProv = selection.provider;
          if (newProv === "hydra-local") { addOutput({ type: "error", content: "Hydra wurde aus dem Katalog entfernt. Wähle mit /model ein verfügbares Modell." }); return true; }
          const newModel = selection.model;
          const newConfig = buildModelSwitchConfig(
            config,
            newModel,
            newProv,
            getStoredApiKey,
          );
          setConfig(newConfig);
          saveConfig({ model: newModel, provider: newProv, baseUrl: newConfig.baseUrl });
          addOutput({ type: "success", content: `Model: ${getModelDisplayName(newModel)} [${newProv}]` });
        } else {
          refreshInstalledOllamaModels();
          addOutput({ type: "info", content: "Aktualisiere verfügbare Provider-Modelle..." });
          (async () => {
            try {
              const results = await refreshProviderModelCatalogs(getStoredApiKey);
              const updated = results.filter((result) => result.status === "updated");
              const failed = results.filter((result) => result.status === "failed");
              if (updated.length > 0) {
                addOutput({
                  type: "success",
                  content: `Modellkatalog aktualisiert: ${updated.map((result) => `${result.provider} (${result.modelCount})`).join(", ")}`,
                });
              }
              if (failed.length > 0) {
                addOutput({
                  type: "info",
                  content: `Katalog derzeit nicht erreichbar für: ${failed.map((result) => result.provider).join(", ")}`,
                });
              }
            } catch (error) {
              addOutput({
                type: "info",
                content: `Live-Modellkatalog nicht erreichbar (${(error as Error).message}).`,
              });
            } finally {
              setSlashCommands(buildSlashCommands(customCommands));
              setShowModelPicker(true);
            }
          })();
        }
        return true;

      case "/provider":
        if (arg) {
          const providers = listProviders();
          const found = providers.find((p: any) => p.name === arg.toLowerCase());
          if (found) {
            const defaultModel = found.models[0]?.startsWith("(") ? config.model : found.models[0];
            const newConfig = buildModelSwitchConfig(
              config,
              defaultModel,
              found.name,
              getStoredApiKey,
            );
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
        addOutput({ type: "info", content: `Projekt-Kontext:\n  CWD: ${cwd}\n  Name: ${ctx.projectName}\n  Sprache: ${ctx.language || "unbekannt"}\n  Framework: ${ctx.framework || "keins"}\n  Git: ${ctx.hasGit ? ctx.gitBranch || "ja" : "nein"}\n  Dateien: ${ctx.files.length}` });
        return true;

      case "/cost": {
        addOutput({ type: "info", content: `Kosten-Tracking:\n\n${formatCostDisplay()}${isFreeTier(config.model, config.provider) ? "\n\n  Aktuelles Model ist kostenlos!" : ""}` });
        return true;
      }

      case "/stats": {
        const elapsed = Math.round((Date.now() - sessionStart) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const costs = getSessionCosts();
        let text = `Session-Statistiken:\n\n  Laufzeit:        ${mins}m ${secs}s\n  Messages:        ${messages.length}\n  Tool-Aufrufe:    ${toolStats.calls}\n  Dateien gelesen: ${toolStats.filesRead}\n  Dateien geschrieben: ${toolStats.filesWritten}\n  Dateien bearbeitet:  ${toolStats.filesEdited}\n  Bash-Befehle:    ${toolStats.bashCommands}\n  Undo-Stack:      ${getUndoStackSize()}\n  Model:           ${getModelDisplayName(config.model)}\n  Provider:        ${config.provider || detectProvider(config.model)}\n  Agent:           ${activeAgent || "keiner"}\n  Plan-Modus:      ${planMode ? "AN" : "AUS"}\n  Think-Modus:     ${thinkMode ? "AN" : "AUS"}\n  Vim-Modus:       ${vimMode ? "AN" : "AUS"}\n  Fast-Modus:      ${config.fast ? "AN" : "AUS"}`;
        if (costs.messages > 0) text += `\n  Kosten:          $${costs.totalCost.toFixed(4)}`;
        addOutput({ type: "info", content: text });
        return true;
      }

      case "/permissions":
        if (arg && isValidPermissionMode(arg)) {
          const nextMode = arg as PermissionMode;
          if ((config.disableBypassPermissions && nextMode === "bypassPermissions") || (config.runtimeSettings?.managedPermissionMode && nextMode !== config.runtimeSettings.managedPermissionMode)) {
            addOutput({ type: "error", content: "Dieser Modus ist durch die verwalteten Einstellungen gesperrt." });
            return true;
          }
          setPermissionMode(nextMode);
          applyInteractionMode(nextMode);
          addOutput({ type: "success", content: `Permission-Modus: ${nextMode} — ${getPermissionModeDescription(nextMode)}` });
        } else {
          const modes: PermissionMode[] = ["auto", "ask", "strict", "bypassPermissions", "acceptEdits", "plan", "dontAsk", "delegate"];
          const current = config.permissionMode || getPermissionMode();
          const modeList = modes.map(m => `  ${m === current ? "→ " : "  "}${m.padEnd(22)} ${getPermissionModeDescription(m)}`).join("\n");
          addOutput({ type: "info", content: `Permission-Modus: ${current}\n\n${modeList}` });
        }
        return true;

      case "/settings":
        if (arg === "init") {
          const path = initProjectSettings(cwd);
          addOutput({ type: "success", content: `Settings erstellt: ${path}` });
        } else {
          addOutput({ type: "info", content: `Settings:\n  Global:  ${getGlobalSettingsPath()}\n  Projekt: ${projectSettingsExist(cwd) ? getProjectSettingsPath(cwd) : "nicht vorhanden"}\n\n  /settings init — Erstellen` });
        }
        return true;

      // Git commands
      case "/diff":
      case "/status":
      case "/log":
      case "/branches":
      case "/git-branches": {

        try {
          let gitCmd: string;
          if (cmd === "/diff") gitCmd = arg === "staged" ? "git diff --cached" : "git diff";
          else if (cmd === "/status") gitCmd = "git status";
          else if (cmd === "/log") gitCmd = `git log --oneline -${arg ? parseInt(arg, 10) || 10 : 10}`;
          else gitCmd = "git branch -a";
          const result = execSync(gitCmd, { cwd: cwd, encoding: "utf-8", timeout: 10000 }).trim();
          addOutput({ type: "text", content: result || "Keine Aenderungen." });
        } catch (e) {
          addOutput({ type: "error", content: `Git Fehler: ${(e as Error).message}` });
        }
        return true;
      }

      // Codebase Analysis
      case "/onboard":
        addOutput({ type: "info", content: "Projekt-Onboarding...\n\n" + generateOnboarding(cwd) });
        return true;

      case "/score": {
        const score = generateProjectScore(cwd);
        const bar = (label: string, val: number) => {
          const filled = Math.round(val / 5);
          const empty = 20 - filled;
          return `  ${label.padEnd(16)} ${"█".repeat(filled)}${"░".repeat(empty)} ${val}%`;
        };
        addOutput({ type: "info", content: `Projekt-Score:\n\n${bar("Quality", score.quality)}\n${bar("Test Coverage", score.testCoverage)}\n${bar("Type Safety", score.typeSafety)}\n${bar("Documentation", score.documentation)}\n${bar("Security", score.security)}\n\n  Overall: ${score.overall}%${score.quickWins.length > 0 ? "\n\n  Quick Wins:\n" + score.quickWins.map((w: string) => `    ${w}`).join("\n") : ""}` });
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
        } else {
          const ascii = renderDepGraphAscii(graph, process.stdout.columns || 80);
          addOutput({ type: "text", content: ascii });
          addOutput({ type: "info", content: `${graph.nodes.length} Dateien \u00B7 ${graph.edges.length} Verbindungen` });
        }
        return true;
      }

      case "/map": {
        const map = getRepoMap(cwd);
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
        const mdPath = joinPath(cwd, "MORNINGSTAR.md");
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
        {
          const result = grepSearch(arg, cwd, undefined, undefined, undefined, undefined, true, 30);
          addOutput({
            type: result.success ? "text" : "error",
            content: result.result || `Keine Treffer fuer "${arg}".`,
          });
        }
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
          addOutput({ type: "info", content: `Gespeicherte Sessions:\n\n${convs.slice(0, 20).map((c: any) => `  ${c.id}  ${c.name} (${c.messageCount} msgs, ${c.savedAt.split("T")[0]})`).join("\n")}\n\n  /history load <id oder name> zum Laden` });
          return true;
        }
        if (subCmd === "save") {
          const name = parts.slice(2).join(" ") || session.name || `Session ${new Date().toLocaleString("de-DE")}`;
          try { renameSession(name); addOutput({ type: "success", content: `Session gespeichert: ${session.id} „${session.name}“` }); }
          catch (error) { addOutput({ type: "error", content: (error as Error).message }); }
          return true;
        }
        if (subCmd === "delete" && parts[2]) {
          const reference = parts.slice(2).join(" ");
          if (deleteConversation(reference)) addOutput({ type: "success", content: `Session "${reference}" geloescht.` });
          else addOutput({ type: "error", content: describeMissingSession(reference) });
          return true;
        }
        // "load" is optional: everything that is not a known subcommand is
        // treated as a session reference, so `/history allgemein` just works.
        const reference = subCmd === "load"
          ? parts.slice(2).join(" ")
          : parts.slice(1).join(" ");
        if (!reference) { session.save(); setShowSessionPicker(true); return true; }
        try { changeSession("resume", reference); }
        catch (error) { addOutput({ type: "error", content: (error as Error).message }); }
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
        addOutput({ type: "info", content: `Konfiguration:\n\n  provider:    ${config.provider || detectProvider(config.model)}\n  model:       ${getModelDisplayName(config.model)}\n  baseUrl:     ${config.baseUrl}\n  maxTokens:   ${config.maxTokens}\n  temperature: ${config.temperature}\n  theme:       ${getThemeId()}\n  fast:        ${config.fast ? "ON" : "OFF"}\n  vim:         ${vimMode ? "ON" : "OFF"}\n  maxTurns:    ${config.maxTurns || "unbegrenzt"}\n  allowedTools:${config.allowedTools ? " " + config.allowedTools.join(", ") : " all"}\n\n  /model für Provider und Modelle · /settings für Projekteinstellungen` });
        return true;

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

      // ── /imagine — Image Generation (direct, no AI filter) ──
      case "/imagine": {
        if (!arg) {
          addOutput({ type: "info", content: "Nutzung: /imagine <prompt>\n  /imagine setup  — Lokales Stable Diffusion installieren\n  /imagine start  — Lokalen Server starten\n  /imagine stop   — Server stoppen\n  /imagine models — Verfuegbare Modelle\n\n  Standard: Gemini (Nano Banana Qualitaet, benoetigt GOOGLE_API_KEY)\n  Fallback: RealVisXL V4.0 (lokal, photorealistisch)\n\n  Optionen:\n    --model gemini|realvis|sdxl|sdxl-turbo|sd15\n    --steps 40  --width 1024  --height 1024\n    --seed 42   --negative 'blurry, ugly'\n\n  Bilder werden in ~/Downloads gespeichert" });
          return true;
        }
        if (arg === "setup") {
          addOutput({ type: "info", content: "Starte Image Generation Setup..." });
          (async () => {
            try {
              await setupImageGen((s) => addOutput({ type: "info", content: `  ${s}` }));
              addOutput({ type: "success", content: "Image Generation Setup fertig!\n  Starte den Server mit: /imagine start\n  Dann: /imagine <dein prompt>" });
            } catch (e: any) {
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
            } catch (e: any) {
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
        let imgModel: string | undefined;
        let imgSteps: number | undefined;
        let imgWidth: number | undefined;
        let imgHeight: number | undefined;
        let imgSeed: number | undefined;
        let imgGuidance: number | undefined;
        let imgNegative: string | undefined;
        const optRegex = /--(\w+)\s+(?:'([^']*)'|"([^"]*)"|(\S+))/g;
        let optMatch: RegExpExecArray | null;
        while ((optMatch = optRegex.exec(arg)) !== null) {
          const val = optMatch[2] ?? optMatch[3] ?? optMatch[4];
          switch (optMatch[1]) {
            case "model": imgModel = val; break;
            case "steps": imgSteps = parseInt(val); break;
            case "width": imgWidth = parseInt(val); break;
            case "height": imgHeight = parseInt(val); break;
            case "seed": imgSeed = parseInt(val); break;
            case "guidance": imgGuidance = parseFloat(val); break;
            case "negative": imgNegative = val; break;
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
          } catch (e: any) {
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
              if (!running) { addOutput({ type: "error", content: "Ollama nicht erreichbar. Starte: ollama serve" }); return; }
              await pullVisionModel(modelToSetup, (s) => addOutput({ type: "info", content: `  ${s}` }));
              addOutput({ type: "success", content: `Vision-Model '${modelToSetup}' bereit!` });
            } catch (e: any) {
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
            if (!running) { addOutput({ type: "error", content: "Ollama nicht erreichbar. Starte: ollama serve" }); return; }
            const installed = await isVisionModelInstalled();
            if (!installed) { addOutput({ type: "error", content: `Vision-Model nicht installiert.\n  Nutze: /vision setup ${DEFAULT_VISION_MODEL}` }); return; }
            const result = await analyzeImageFull(imgPath, visionPrompt);
            addOutput({ type: "success", content: `Vision-Analyse:\n\n${result}` });
          } catch (e: any) {
            addOutput({ type: "error", content: `Vision-Fehler: ${e.message}` });
          }
        })();
        return true;
      }

      // ── /skill — Skills System ──
      case "/skill":
      case "/skill:list": {
        addOutput({ type: "info", content: runSkillCommand(arg || "list", cwd) + "\n/skill:<id> zum Aktivieren · /skill search <begriff>" });
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
        } else {
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
          } else {
            addOutput({ type: "error", content: ruleResult.error || "Rule-Erstellung fehlgeschlagen." });
          }
          return true;
        }
        if (rulesSubCmd === "show" && parts[2]) {
          const rules = loadRules(cwd);
          const rule = rules.find(r => r.id === parts[2]);
          if (rule) {
            addOutput({ type: "info", content: `Rule: ${rule.id}\n  Source: ${rule.source}\n  File: ${rule.filePath}\n${rule.pathPattern ? `  Path: ${rule.pathPattern}\n` : ""}  Priority: ${rule.priority || 0}\n\n${rule.content.slice(0, 500)}` });
          } else {
            addOutput({ type: "error", content: `Rule "${parts[2]}" nicht gefunden.` });
          }
          return true;
        }
        const rules = loadRules(cwd);
        addOutput({ type: "info", content: `Rules:\n\n${formatRulesList(rules)}\n\n  /rules add <id> [content] — Rule hinzufuegen\n  /rules show <id> — Rule anzeigen` });
        return true;
      }

      // ── /doctor — System health check ──
      case "/doctor": {
        runDoctor().then(checks => {
          addOutput({ type: "info", content: formatDoctorReport(checks) });
        });
        return true;
      }

      // ── /audit — Deep system audit ──
      case "/audit": {
        runAudit().then(auditChecks => {
          addOutput({ type: "info", content: formatAuditReport(auditChecks) });
        });
        return true;
      }

      // ── /repair — Auto-fix issues ──
      case "/repair": {
        runDoctor().then(doctorChecks => {
          const repairResult = runRepair(doctorChecks);
          addOutput({ type: "success", content: `Repair: ${repairResult.fixed} behoben, ${repairResult.remaining} verbleibend.` });
        });
        return true;
      }

      // ── /instinct-status — Show learning status ──
      case "/instinct-status":
      case "/learn":
      case "/instincts": {
        const projectId = detectProjectId(cwd);
        if (arg === "on" || arg === "off") {
          const enabled = arg === "on";
          setConfig(prev => ({ ...prev, selfImprovement: enabled }));
          if (!config.noSessionPersistence) saveConfig({ selfImprovement: enabled });
          addOutput({ type: "info", content: `Aktives Lernen ${enabled ? "eingeschaltet" : "ausgeschaltet"}.${config.noSessionPersistence ? " Diese Sitzung speichert weiterhin nichts." : ""}` });
          return true;
        }
        if (arg?.startsWith("forget ")) {
          const id = arg.slice(7).trim();
          const instinct = loadInstincts(projectId).find(i => i.id === id && i.projectId === projectId);
          if (!instinct) { addOutput({ type: "error", content: "Keine gelernte Projektregel mit dieser ID." }); return true; }
          if (config.noSessionPersistence) { addOutput({ type: "info", content: "Ohne Sitzungsspeicherung werden auch Lernregeln nicht verändert." }); return true; }
          saveInstinct({ ...instinct, confidence: 0.3, disabled: true });
          addOutput({ type: "success", content: `Regel deaktiviert: ${id}. Der Nachweis bleibt erhalten.` }); return true;
        }
        const rules = loadInstincts(projectId).filter(i => i.projectId === projectId);
        const status = formatInstinctsStatus(projectId);
        addOutput({ type: "info", content: `Aktives Lernen: ${config.selfImprovement && !config.noSessionPersistence ? "an" : "aus"}\n/learn on|off · /learn forget <id>\n${rules.map(i => `${i.id} [${i.disabled ? "inaktiv" : i.source ?? "manuell"}] ${i.action}\n  ${i.evidence.at(-1) ?? ""}`).join("\n")}\n${status}` });
        return true;
      }

      // ── /instinct-export — Export learned instincts ──
      case "/instinct-export": {
        const exported = exportInstincts();
        const exportFile = joinPath(cwd, `instincts-${Date.now()}.json`);
        writeFileSync(exportFile, exported, "utf-8");
        addOutput({ type: "success", content: `Instincts exportiert: ${exportFile}` });
        return true;
      }

      // ── /instinct-import — Import instincts ──
      case "/instinct-import": {
        if (!arg) {
          addOutput({ type: "error", content: "Usage: /instinct-import <pfad-zu-json>" });
          return true;
        }
        try {
          const importData = readFileSync(resolvePath(cwd, arg), "utf-8");
          const importResult = importInstincts(importData);
          addOutput({ type: "success", content: `${importResult.imported} Instincts importiert.${importResult.errors.length > 0 ? ` Fehler: ${importResult.errors.join(", ")}` : ""}` });
        } catch (e) {
          addOutput({ type: "error", content: `Import fehlgeschlagen: ${(e as Error).message}` });
        }
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
        void copyText(lastAssistant.content)
          .then(() => addOutput({ type: "success", content: "Letzte Antwort kopiert." }))
          .catch(error => addOutput({ type: "error", content: error.message }));
        return true;
      }

      // ── /rename — Rename session ──
      case "/rename": {
        try { renameSession(arg); addOutput({ type: "success", content: `Session umbenannt: „${session.name}“` }); }
        catch (error) { addOutput({ type: "error", content: (error as Error).message }); }
        return true;
      }

      // ── /rewind — Remove last N messages ──
      case "/rewind": {
        setShowRewind(true);
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
          } else {
            addOutput({ type: "error", content: teamResult.error || "Team-Erstellung fehlgeschlagen." });
          }
          return true;
        }
        if (teamSubCmd === "add" && parts[2] && parts[3] && parts[4]) {
          const role = parts[4].toLowerCase() as TeamRole;
          const result = addTeamMember(parts[2], parts[3], role);
          addOutput({
            type: result.success ? "success" : "error",
            content: result.success
              ? `${parts[3]} wurde ${parts[2]} als ${role} hinzugefuegt.`
              : result.error || "Team-Mitglied konnte nicht hinzugefuegt werden.",
          });
          return true;
        }
        if (teamSubCmd === "remove" && parts[2] && parts[3]) {
          const result = removeTeamMember(parts[2], parts[3]);
          addOutput({
            type: result.success ? "success" : "error",
            content: result.success
              ? `${parts[3]} wurde aus ${parts[2]} entfernt.`
              : result.error || "Team-Mitglied konnte nicht entfernt werden.",
          });
          return true;
        }
        if (teamSubCmd === "show" && parts[2]) {
          const team = getTeam(parts[2]);
          addOutput({
            type: team ? "info" : "error",
            content: team ? formatTeamDetails(team) : `Team "${parts[2]}" nicht gefunden.`,
          });
          return true;
        }
        if (teamSubCmd === "delete" && parts[2]) {
          if (deleteTeam(parts[2])) addOutput({ type: "success", content: `Team "${parts[2]}" geloescht.` });
          else addOutput({ type: "error", content: `Team "${parts[2]}" nicht gefunden.` });
          return true;
        }
        if (teamSubCmd === "run" && parts[2]) {
          const team = getTeam(parts[2]);
          const task = parts.slice(3).join(" ").trim();
          if (!team) {
            addOutput({ type: "error", content: `Team "${parts[2]}" nicht gefunden.` });
            return true;
          }
          if (!task) {
            addOutput({ type: "error", content: "Nutzung: /team run <team> <aufgabe>" });
            return true;
          }
          const executionOrder = getTeamExecutionOrder(team);
          if (executionOrder.length === 0) {
            addOutput({
              type: "error",
              content: `Team "${team.id}" hat keine Mitglieder. Nutze /team add <team> <agent> <rolle>.`,
            });
            return true;
          }

          addOutput({
            type: "info",
            content: `Team "${team.name}" startet ${executionOrder.length} Agent(s): ${task}`,
          });
          (async () => {
            const controller = new AbortController();
            abortRef.current = controller;
            setIsProcessing(true);
            try {
              const results = await executeSubAgentPipeline(
                executionOrder.map((member) => ({
                  agentId: member.agentId,
                  description: `${task}\n\n${buildTeamPrompt(team, member.agentId, [])}`,
                })),
                config,
                cwd,
                getFullSystemPrompt(),
                controller.signal,
                (index, status) =>
                  setTaskLabel(`[${index + 1}/${executionOrder.length}] ${status}`),
                {
                  onApproval: ({ invocation, verdict }) => requestApproval({
                    tool: invocation.name,
                    target: invocationTarget(invocation),
                    reason: verdict.reason,
                    risk: verdict.risk,
                  }),
                },
              );
              const successful = results.length === executionOrder.length
                && results.every((result) => result.task.status === "completed");
              addOutput({
                type: successful ? "success" : "error",
                content: formatSubAgentResults(results),
              });
              const combined = results
                .filter((result) => result.fullResponse)
                .map((result) => `[${result.task.agentId}]\n${result.fullResponse}`)
                .join("\n\n---\n\n");
              if (combined) {
                setMessages((previous) => [...previous, {
                  role: "assistant" as const,
                  content: `[Team ${team.id}]\n\n${combined}`,
                }]);
              }
            } catch (error) {
              addOutput({ type: "error", content: `Team-Fehler: ${(error as Error).message}` });
            } finally {
              setIsProcessing(false);
              abortRef.current = null;
            }
          })();
          return true;
        }
        const teams = listTeams();
        addOutput({
          type: "info",
          content: `Agent Teams:\n\n${formatTeamsList(teams)}\n\n`
            + "  /team create <id> [name]\n"
            + "  /team add <team> <agent> <lead|worker|reviewer>\n"
            + "  /team remove <team> <agent>\n"
            + "  /team show <id>\n"
            + "  /team run <team> <aufgabe>\n"
            + "  /team delete <id>",
        });
        return true;
      }

      // ── /checkpoint — Checkpointing ──
      case "/checkpoint": {
        const cpSubCmd = parts[1]?.toLowerCase();
        const knownCheckpointCommands = new Set(["create", "list", "restore", "delete"]);
        if (cpSubCmd === "create" || (cpSubCmd && !knownCheckpointCommands.has(cpSubCmd))) {
          const cpName = cpSubCmd === "create"
            ? parts.slice(2).join(" ").trim() || `Checkpoint ${new Date().toLocaleString("de-DE")}`
            : arg;
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
          } else {
            addOutput({ type: "error", content: restoreResult.error || "Checkpoint-Wiederherstellung fehlgeschlagen." });
          }
          return true;
        }
        if (cpSubCmd === "delete" && parts[2]) {
          if (deleteCheckpoint(parts[2])) addOutput({ type: "success", content: `Checkpoint "${parts[2]}" geloescht.` });
          else addOutput({ type: "error", content: `Checkpoint "${parts[2]}" nicht gefunden.` });
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
        if (parts[1]?.toLowerCase() === "launch") {
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
          setEffortLevel(arg.toLowerCase() as EffortLevel);
          addOutput({ type: "success", content: `Effort-Level: ${arg.toLowerCase()}` });
        } else {
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
        } else {
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
        } else {
          addOutput({ type: "info", content: `Keine Agents migriert.${migResult.errors.length > 0 ? `\n  ${migResult.errors.join(", ")}` : ""}` });
        }
        return true;
      }

      // ── /delegate — Sub-Agent Task Delegation ──
      case "/delegate": {
        if (!arg) {
          addOutput({ type: "info", content: "Usage: /delegate <agent> <task>\n  /delegate code Implementiere Login-Feature\n  /delegate debug Finde den Bug in src/app.tsx\n  /delegate:list — Verfuegbare Agents" });
          return true;
        }
        const delegateParts = arg.split(" ");
        const delegateAgent = delegateParts[0];
        const delegateTask = delegateParts.slice(1).join(" ");
        if (!delegateTask) {
          addOutput({ type: "error", content: "Bitte gib eine Aufgabe an: /delegate <agent> <task>" });
          return true;
        }
        const allAgentsCheck = getAllAgents();
        if (!allAgentsCheck[delegateAgent]) {
          const available = Object.keys(allAgentsCheck).join(", ");
          addOutput({ type: "error", content: `Agent "${delegateAgent}" nicht gefunden. Verfuegbar: ${available}` });
          return true;
        }
        setActivity([]); setTaskTurn(0);
        addOutput({ type: "info", content: `Sub-Agent [${allAgentsCheck[delegateAgent].name}] gestartet: ${delegateTask.slice(0, 80)}...` });
        (async () => {
          const ac = new AbortController();
          abortRef.current = ac;
          setIsProcessing(true);
          try {
            const result = await executeSubAgent(
              delegateAgent,
              delegateTask,
              config,
              cwd,
              getFullSystemPrompt(),
              ac.signal,
              config.maxTurns ?? 0,
              (status) => setTaskLabel(status),
              {
                onEvent: event => recordActivity(delegateAgent, event),
                onApproval: ({ invocation, verdict }) => requestApproval({
                  tool: invocation.name,
                  target: invocationTarget(invocation),
                  reason: verdict.reason,
                  risk: verdict.risk,
                }),
              },
            );
            addOutput({ type: result.task.status === "completed" ? "success" : "error", content: formatSubAgentResults([result]) });
            if (result.fullResponse) {
              addOutput({ type: "ai-response", streamingText: result.fullResponse, streamingReasoning: "", startTime: result.task.startTime });
              setMessages(prev => [...prev, { role: "assistant" as const, content: `[Sub-Agent ${delegateAgent}]: ${result.fullResponse}` }]);
            }
          } catch (e) {
            addOutput({ type: "error", content: `Sub-Agent Fehler: ${(e as Error).message}` });
          } finally {
            setIsProcessing(false);
            abortRef.current = null;
          }
        })();
        return true;
      }
      case "/delegate:list": {
        const subAgents = getAvailableSubAgents();
        const list = subAgents.map(a => `  ${a.id.padEnd(15)} ${a.name} — ${a.description}`).join("\n");
        addOutput({ type: "info", content: `Verfuegbare Sub-Agents:\n${list}` });
        return true;
      }
      case "/activity": {
        if (!activityRef.current.length) { addOutput({ type: "info", content: "Noch keine Tool-Aktivität in dieser Sitzung." }); return true; }
        addOutput({ type: "info", content: activityRef.current.map(e => `[${e.agent}] ${e.status} · ${e.label}${e.duration !== undefined ? ` · ${(e.duration / 1000).toFixed(1)}s` : ""}`).join("\n") });
        return true;
      }
      case "/find": {
        if (!internal_eventEmitter.emit("morningstar:find", arg || "")) addOutput({ type: "info", content: "Verlaufssuche benötigt ein interaktives Terminal mit aktiviertem Verlauf (MORNINGSTAR_MOUSE nicht 0)." });
        return true;
      }
      case "/swarm":
      case "/parallel": {
        const raw = (arg || "").trim();
        const parallel = input.startsWith("/parallel");
        if (!raw) {
          addOutput({ type: "info", content: parallel
            ? "/parallel review,code <Aufgabe> — parallele Analyse. Für Umsetzung: /swarm <Ziel>."
            : "/swarm <Ziel> — plant Teilaufgaben, arbeitet parallel, prüft Ergebnisse.\n/swarm @swarm.json — eigenen Plan mit agentId, dependsOn und writePaths ausführen.\nEsc bricht alle Agents ab. /activity zeigt den Arbeitsverlauf." });
          return true;
        }
        const ac = new AbortController();
        abortRef.current = ac;
        setIsProcessing(true);
        setActivity([]);
        setTaskLabel(""); setTaskTurn(0);
        const treeId = nextId.current++;
        const startTs = Date.now();
        let lastTree: OutputItem = { id: treeId, type: "agent-tree", treeTitle: "Swarm · Aufgaben planen", startTime: startTs, treeDone: false, treeBranches: [{ agentId: "planner", status: "running", detail: "teilt das Ziel in Arbeitspakete auf", elapsedMs: 0 }] };
        setLiveTree(lastTree);
        (async () => {
          try {
            const system = getFullSystemPrompt();
            const swarmConfig: CLIConfig = { ...config, permissionMode: skipPermissions || config.dangerouslySkipPermissions ? "bypassPermissions" : planMode ? "plan" : config.permissionMode || getPermissionMode() };
            let plan: SwarmPlan;
            if (parallel) {
              const [csv, ...words] = raw.split(/\s+/);
              if (!words.length) throw new Error("Aufgabe fehlt: /parallel review,code <Aufgabe>");
              plan = validateSwarmPlan({ title: `Parallel · ${words.join(" ")}`, tasks: csv.split(",").filter(Boolean).map((agentId, i) => ({ id: `task-${i + 1}`, agentId, description: words.join(" "), writePaths: [], dependsOn: [] })) }, cwd);
            } else {
              plan = await prepareSwarmPlan(raw, swarmConfig, cwd, system, ac.signal, { onPlanningAttempt: attempt => {
                lastTree = { ...lastTree, treeBranches: [{ agentId: "planner", status: "running", detail: attempt === 1 ? "teilt das Ziel in Arbeitspakete auf" : `JSON-Plan korrigieren · Versuch ${attempt}/3`, elapsedMs: Date.now() - startTs }] };
                setLiveTree(lastTree);
              } });
            }
            if (ac.signal.aborted) throw new Error("Swarm abgebrochen.");
            addOutput({ type: "info", content: `Swarm · ${plan.title}\n${plan.tasks.map(t => `  ${t.id} [${t.agentId}] ${t.description.slice(0, 180)}\n    ${t.exclusive ? "exklusiver Workspace" : t.writePaths.length ? `Dateien: ${t.writePaths.join(", ")}` : "nur lesen"}${t.dependsOn.length ? ` · nach ${t.dependsOn.join(", ")}` : ""}`).join("\n")}` });
            lastTree = { ...lastTree, treeTitle: plan.title, treeBranches: [] };
            const results = await runSwarm(plan, swarmConfig, cwd, system, ac.signal, snapshot => {
              lastTree = { ...lastTree, treeBranches: snapshot };
              setLiveTree(lastTree);
            }, {
              onTaskEvent: (task, event) => { if (!agentNotes.current.has(task.id)) noteAgent(task.id, task.description, true); recordActivity(task.id, event); },
              onApproval: ({ invocation, verdict }) => requestApproval({ tool: invocation.name, target: invocationTarget(invocation), reason: verdict.reason, risk: verdict.risk }),
            });
            addOutput({ ...lastTree, treeDone: true, treeElapsed: Date.now() - startTs });
            const combined = results.map(r => `[${r.task.id} · ${r.task.agentId} · ${r.task.status}]\n${r.fullResponse || r.task.error || "Kein Ergebnis"}`).join("\n\n");
            addOutput({ type: "ai-response", streamingText: combined, startTime: startTs });
            setMessages(prev => [...prev, { role: "user", content: input }, { role: "assistant", content: combined }]);
          } catch (error) {
            addOutput({ type: "error", content: `Swarm: ${(error as Error).message}` });
          } finally { setLiveTree(null); setIsProcessing(false); abortRef.current = null; }
        })();
        return true;
      }

      // ── /watch — File Watcher ──
      case "/watch": {
        if (fileWatcherRef.current && fileWatcherRef.current.isRunning()) {
          fileWatcherRef.current.stop();
          fileWatcherRef.current = null;
          addOutput({ type: "success", content: "File Watcher gestoppt." });
        } else {
          const dirs = detectWatchDirs(cwd);
          const watcher = createFileWatcher(cwd, { dirs });
          watcher.onEvent((event) => {
            addOutput({ type: "info", content: `  [Watch] ${event.type === "create" ? "+" : event.type === "delete" ? "-" : "~"} ${event.relativePath}` });
          });
          watcher.start();
          fileWatcherRef.current = watcher;
          addOutput({ type: "success", content: `File Watcher aktiv — ${dirs.join(", ")}` });
        }
        return true;
      }

      // ── /branch — Conversation Branching ──
      case "/branch": {
        if (!arg) {
          // Create a new branch from current state
          const name = `branch-${Date.now().toString(36)}`;
          const sessionId = config.sessionId || ctx.projectName;
          const branch = createBranch(sessionId, name, messages);
          setCurrentBranchId(branch.id);
          addOutput({ type: "success", content: `Branch "${name}" erstellt (${branch.id.slice(0, 8)}) ab Message ${messages.length}.` });
        } else if (arg === "list") {
          const sessionId = config.sessionId || ctx.projectName;
          const branches = listBranches(sessionId);
          addOutput({ type: "info", content: `Branches:\n${formatBranchesList(branches, currentBranchId ?? undefined)}` });
        } else if (arg.startsWith("switch ")) {
          const branchId = arg.slice(7).trim();
          const sessionId = config.sessionId || ctx.projectName;
          const branchMessages = switchBranch(sessionId, branchId);
          if (branchMessages) {
            setMessages(branchMessages);
            setCurrentBranchId(branchId);
            addOutput({ type: "success", content: `Zu Branch ${branchId.slice(0, 8)} gewechselt (${branchMessages.length} Messages).` });
          } else {
            addOutput({ type: "error", content: `Branch "${branchId}" nicht gefunden.` });
          }
        } else if (arg.startsWith("merge ")) {
          const branchId = arg.slice(6).trim();
          const sessionId = config.sessionId || ctx.projectName;
          const result = mergeBranch(sessionId, branchId, messages);
          if (result) {
            setMessages(result.merged);
            addOutput({ type: "success", content: result.summary });
          } else {
            addOutput({ type: "error", content: `Branch "${branchId}" nicht gefunden.` });
          }
        } else if (arg.startsWith("delete ")) {
          const branchId = arg.slice(7).trim();
          const sessionId = config.sessionId || ctx.projectName;
          if (deleteBranch(sessionId, branchId)) {
            if (currentBranchId === branchId) setCurrentBranchId(null);
            addOutput({ type: "success", content: `Branch ${branchId.slice(0, 8)} geloescht.` });
          } else {
            addOutput({ type: "error", content: `Branch "${branchId}" nicht gefunden.` });
          }
        } else {
          // Named branch
          const sessionId = config.sessionId || ctx.projectName;
          const branch = createBranch(sessionId, arg, messages);
          setCurrentBranchId(branch.id);
          addOutput({ type: "success", content: `Branch "${arg}" erstellt (${branch.id.slice(0, 8)}).` });
        }
        return true;
      }

      // ── /update — Self-Update ──
      case "/update": {
        if (!arg || arg === "check") {
          addOutput({ type: "info", content: "Pruefe auf Updates..." });
          const info = checkForUpdate(true);
          addOutput({ type: "info", content: formatUpdateInfo(info) });
        } else if (arg === "run" || arg === "install") {
          addOutput({ type: "info", content: "Starte Self-Update..." });
          const result = performUpdate();
          addOutput({ type: result.success ? "success" : "error", content: formatUpdateResult(result) });
        } else {
          addOutput({ type: "info", content: "Nutzung: /update [check|run]" });
        }
        return true;
      }

      // ── /pr-review — Smart PR Review ──
      case "/pr-review": {
        if (!arg) { addOutput({ type: "info", content: "Nutzung: /pr-review <nummer|url>" }); return true; }
        try {
          addOutput({ type: "info", content: `Lade PR-Daten fuer: ${arg}...` });
          const { prData, diff } = fetchPRData(arg, cwd);
          const analysis = analyzePRDiff(diff);
          const reviewPrompt = generateReviewPrompt(prData, analysis);
          addOutput({ type: "success", content: `PR #${prData.number}: ${prData.title}\n  ${analysis.totalFiles} Dateien, +${analysis.totalAdditions}/-${analysis.totalDeletions}\n  Tests: ${analysis.hasTests ? "Ja" : "Nein"} · Config: ${analysis.hasConfigChanges ? "Ja" : "Nein"}` });
          addOutput({ type: "info", content: "Review-Prompt bereit. Sende 'review' um das Review zu starten." });
          // Speichere Review-Prompt als naechste User-Nachricht
          setMessages(prev => [...prev, { role: "user", content: reviewPrompt }]);
        } catch (e) {
          addOutput({ type: "error", content: `PR Review Fehler: ${(e as Error).message}` });
        }
        return true;
      }

      // ── /cache — Prompt Cache Statistiken ──
      case "/cache": {
        addOutput({ type: "info", content: formatCacheStats() });
        return true;
      }

      // ── /split — Terminal Layout wechseln ──
      case "/split": {
        if (!arg || arg === "list") {
          addOutput({ type: "info", content: formatLayoutList() });
        } else {
          const layouts = getAvailableLayouts();
          const found = layouts.find(l => l.id === arg);
          if (found) {
            addOutput({ type: "success", content: `Layout gewechselt: ${found.name} (${found.panes.length} Panes)` });
          } else {
            addOutput({ type: "error", content: `Layout "${arg}" nicht gefunden. Verfuegbar: ${layouts.map(l => l.id).join(", ")}` });
          }
        }
        return true;
      }

      // ── /dashboard — Web Dashboard ──
      case "/dashboard": {
        if (dashboardRef.current?.isRunning) {
          addOutput({ type: "info", content: formatDashboardStatus(dashboardRef.current) });
        } else {
          const port = arg ? parseInt(arg, 10) : 3030;
          addOutput({ type: "info", content: "Starte Web Dashboard..." });
          startDashboard({
            port: isNaN(port) ? 3030 : port,
            host: "127.0.0.1",
            cliConfig: config,
            getMessages: () => messages,
            getSessionStart: () => sessionStart,
          }).then(state => {
            dashboardRef.current = state;
            addOutput({ type: "success", content: `Dashboard aktiv: ${state.accessUrl}` });
          }).catch((e: Error) => {
            addOutput({ type: "error", content: `Dashboard Fehler: ${e.message}` });
          });
        }
        return true;
      }

      case "/quit":
      case "/exit":
      case "/q":
        void disconnectAllMCPServers();
        stopDashboard();
        // Stop file watcher on quit
        if (fileWatcherRef.current?.isRunning()) {
          fileWatcherRef.current.stop();
        }
        // Auto-save on quit
        if (messages.length > 2) {
          autoSave(messages, ctx.projectName, config.model);
        }
        // Save branch state
        if (currentBranchId) {
          const sessionId = config.sessionId || ctx.projectName;
          const branch = { id: currentBranchId, name: "", parentId: sessionId, parentBranch: null, forkPoint: 0, messages, createdAt: "", updatedAt: "" };
          saveBranch(sessionId, branch as ConversationBranch);
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
          } else {
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

        // Custom commands (with agent auto-binding from ECC)
        const customCmd = customCommands.find(c => cmd === `/${c.name}`);
        if (customCmd) {
          // Auto-activate associated agent if command has agent field
          if (customCmd.agent) {
            const allAgentsMap = getAllAgents();
            if (allAgentsMap[customCmd.agent]) {
              setActiveAgent(customCmd.agent);
              addOutput({ type: "info", content: `Agent aktiviert: ${allAgentsMap[customCmd.agent].name || customCmd.agent}` });
            }
          }
          void processInput(
            `${customCmd.content}\n\n${arg || ""}`,
            {
              effectiveAgentId: customCmd.agent,
              promptTemplate: true,
            },
          );
          return true;
        }

        const pluginCommand = getRegisteredCommands()[cmd.slice(1)];
        if (pluginCommand) {
          void Promise.resolve(pluginCommand.handler(arg)).catch((error: unknown) => {
            addOutput({
              type: "error",
              content: `Plugin-Befehl ${cmd} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
            });
          });
          return true;
        }

        return false;
      }
    }
  }

  // ── Auto-Fallback: Detect complex tasks on weak local models ──
  function detectFallbackConfig(input: string): { fallbackConfig: CLIConfig; fallbackModel: string } | null {
    const currentProvider = config.provider || detectProvider(config.model);

    // Only fallback from ollama (local models)
    if (currentProvider !== "ollama") return null;

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
    if (!isComplex) return null;

    // Check for available cloud API keys (priority: DeepSeek free → others)
    const fallbackOptions: { provider: string; model: string }[] = [
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
  const processInput = useCallback(async (
    input: string,
    runContext: InputRunContext = {},
  ) => {
    if (!input.trim()) return;
    const localRoute = classifyLocalInput(input, runContext);

    // ── Pending CD choice: user picks a number ──
    if (!runContext.promptTemplate && pendingCdChoices.length > 0) {
      const num = parseInt(input.trim(), 10);
      if (num >= 1 && num <= pendingCdChoices.length) {
        const chosen = pendingCdChoices[num - 1];
        setPendingCdChoices([]);
        setCwd(chosen);
        process.chdir(chosen);
        addOutput({ type: "success", content: `Verzeichnis gewechselt: ${chosen}` });
        return;
      } else {
        setPendingCdChoices([]);
        addOutput({ type: "info", content: "Auswahl abgebrochen." });
        // Don't return — let the input be processed normally
      }
    }

    if (localRoute === "slash" && /^\/review(?:\s|$)/.test(input)) {
      const scope = input.replace(/^\/review\s*/, "").trim();
      const controller = new AbortController(); abortRef.current = controller;
      setIsProcessing(true); setTaskLabel("Code-Review · nur lesen");
      addOutput({ type: "info", content: `Review · ${scope || "aktuelle Änderungen"}` });
      try {
        const result = await runCodeReview(scope, config, cwd, { signal: controller.signal, initialCostUsd: getSessionCosts().totalCost, onEvent: event => recordActivity("review", event) });
        trackUsage(config.model, scope, result.finalText, result.usage.inputTokens, result.usage.outputTokens, config.provider);
        addOutput({ type: result.aborted || result.budgetExceeded || result.hitTurnLimit ? "error" : "info", content: result.finalText || "Review ohne Abschlussantwort." });
      } catch (error) { addOutput({ type: "error", content: (error as Error).message }); }
      finally { abortRef.current = null; setIsProcessing(false); setTaskLabel(""); }
      return;
    }
    if (localRoute === "slash" && /^\/btw(?:\s|$)/.test(input)) {
      const question = input.replace(/^\/btw\s*/, "").trim();
      if (!question) { addOutput({ type: "info", content: "Verwendung: /btw <Nebenfrage>" }); return; }
      const controller = new AbortController();
      abortRef.current = controller;
      setIsProcessing(true);
      addOutput({ type: "info", content: `Nebenfrage: ${question}` });
      try {
        const result = await runSideQuestion(messages, question, config, cwd, { signal: controller.signal, initialCostUsd: getSessionCosts().totalCost });
        trackUsage(config.model, question, result.finalText, result.usage.inputTokens, result.usage.outputTokens, config.provider);
        addOutput({ type: result.aborted || result.budgetExceeded || result.hitTurnLimit || result.toolCalls.some((tool) => !tool.success) ? "error" : "info", content: result.finalText || "Keine Antwort." });
      } catch (error) { addOutput({ type: "error", content: (error as Error).message }); }
      finally { abortRef.current = null; setIsProcessing(false); }
      return;
    }

    // Handle slash commands
    if (localRoute === "slash") {
      const handled = handleSlashCommand(input);
      if (handled) return;
    }

    // ── ! Bash Mode: execute rest as bash command directly ──
    if (localRoute === "bang") {
      const bashCmd = input.slice(1).trim();
      if (bashCmd) {
        if (config.toolAllowlist && !config.toolAllowlist.some((tool) => tool.toLowerCase() === "bash")) {
          addOutput({ type: "error", content: "Bash ist durch --tools deaktiviert." });
          return;
        }
        addOutput({ type: "text", content: `> !${bashCmd}` });
        const configuredMode = config.permissionMode && isValidPermissionMode(config.permissionMode)
          ? config.permissionMode
          : getPermissionMode();
        const permissionMode: PermissionMode = skipPermissions || config.dangerouslySkipPermissions
          ? "bypassPermissions"
          : configuredMode;
        const verdict = decidePermission(
          "bash",
          bashCmd,
          permissionMode,
          config.allowedTools,
          config.disallowedTools,
          config.askTools,
          config.disableBypassPermissions,
          cwd,
        );

        if (verdict.decision === "deny") {
          addOutput({ type: "error", content: `Bash verweigert: ${verdict.reason}` });
          return;
        }
        if (verdict.decision === "ask") {
          const approved = await requestApproval({
            tool: "bash",
            target: bashCmd,
            reason: verdict.reason,
            risk: verdict.risk,
          });
          if (!approved) {
            addOutput({ type: "info", content: "Bash-Befehl wurde nicht ausgeführt." });
            return;
          }
        }

        const directAbort = new AbortController();
        abortRef.current = directAbort;
        setIsProcessing(true);
        try {
          const result = await executeToolCall(
            { tool: "bash", args: { command: bashCmd } },
            cwd,
            directAbort.signal,
          );
          addOutput({
            type: "tool-result",
            tool: result.tool,
            result: result.result || "(kein Output)",
            success: result.success,
            command: bashCmd,
          });
        } finally {
          if (abortRef.current === directAbort) abortRef.current = null;
          setIsProcessing(false);
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
    if (localRoute === "cd") {
      const cdArg = input.trim().replace(/^cd\s*/, "").trim() || "~";
      handleSlashCommand(`/cd ${cdArg}`);
      return;
    }

    // ── Auto-detect image generation intent → route to /imagine ──
    // Strict: only match when image/photo/picture is the direct object of
    // a create verb, AND the input has no programming/build-context keywords
    // (which frequently contain words like "bild", "image", "picture" as
    // incidental mentions, e.g. "game mit bildern", "page with images").
    if (!runContext.promptTemplate) {
      const lower = input.toLowerCase();
      // Exclude anything that looks like a coding / project task.
      const codingHints = /\b(game|spiel|app|programm|website|webseite|seite|page|html|css|javascript|typescript|python|rust|go|java|php|react|vue|svelte|next|fastapi|script|code|funktion|function|feature|projekt|project|component|modul|module|package|ordner|folder|datei|file|repo|repository|branch|commit|merge|pr|issue|api|server|client|endpoint|route|database|db|table|schema|migration|test|bug|fix|refactor|build|deploy)\b/i;
      if (codingHints.test(lower)) {
        // fall through — let the AI handle it normally
      } else {
        // Tight patterns — image/photo/picture/wallpaper must be the object.
        const imageKeywords = [
          /\b(mach|erstelle|generiere|erzeuge|zeichne|male)\s+(mir\s+)?(ein|eine|einen|doch|bitte\s+)?\s*(bild|foto|wallpaper|artwork|illustration)\b/i,
          /\b(make|create|generate|draw|paint)\s+(me\s+)?(an?\s+)?(image|picture|wallpaper|artwork|illustration)\b/i,
          /\b(bild|foto|image|picture|wallpaper)\s+von\s+\S/i,
          /\b(image|picture|photo|wallpaper)\s+of\s+\S/i,
        ];
        if (imageKeywords.some((re) => re.test(lower))) {
          addOutput({ type: "info", content: "Bild-Anfrage erkannt — leite zu /imagine weiter..." });
          handleSlashCommand(`/imagine ${input}`);
          return;
        }
      }
    }

    setIsProcessing(true);
    setActivity([]);
    const abort = new AbortController();
    abortRef.current = abort;
    const signal = abort.signal;

    // ── Auto-Fallback for complex tasks on local models ──
    let activeConfig = config;
    const fallback = detectFallbackConfig(input);
    if (fallback) {
      const fallbackProvider = fallback.fallbackConfig.provider
        || detectProvider(fallback.fallbackModel);
      const approved = await requestApproval({
        tool: "provider-fallback",
        target: `${config.provider || detectProvider(config.model)}/${config.model} → ${fallbackProvider}/${fallback.fallbackModel}`,
        reason: "Ein lokaler Auftrag würde an einen gehosteten Provider übertragen.",
        risk: "high",
      });
      if (approved) {
        activeConfig = fallback.fallbackConfig;
        addOutput({
          type: "info",
          content: `Cloud-Fallback freigegeben: ${getModelDisplayName(fallback.fallbackModel)} (${fallbackProvider})`,
        });
      } else {
        addOutput({
          type: "info",
          content: `Cloud-Fallback abgelehnt — Auftrag bleibt bei ${getModelDisplayName(config.model)}.`,
        });
      }
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
    if (mentionContext) userContent = mentionContext + "\n\n" + userContent;

    // ── Active skill prompt addition ──
    const skillToApply = activeSkill || triggeredSkill;
    if (skillToApply) {
      userContent += getSkillPromptAddition(skillToApply);
    }

    // ── Debug info ──
    if (debugMode) {
      addOutput({ type: "info", content: `[DEBUG] Messages: ${messages.length}, Tokens ~${Math.round(userContent.length / 4)}, Model: ${activeConfig.model}` });
    }

    // Custom commands can bind an agent for this exact run. React state updates
    // are asynchronous, so derive prompt + allowlist from one immutable id.
    const effectiveAgentId = runContext.effectiveAgentId ?? activeAgent ?? undefined;
    const allAgentsForRun = getAllAgents();
    const effectiveAgent = effectiveAgentId
      ? allAgentsForRun[effectiveAgentId]
      : undefined;
    const runMessages = effectiveAgentId && effectiveAgent
      ? messages.map((message, index) =>
          index === 0 && message.role === "system"
            ? {
                role: "system" as const,
                content: getAgentPrompt(
                  effectiveAgentId,
                  getFullSystemPrompt(),
                  allAgentsForRun,
                ),
              }
            : message)
      : messages;

    // Add user message
    const newMessages = [...runMessages, { role: "user" as const, content: userContent, ...(runContext.images?.length ? { images: runContext.images } : {}) }];
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
    const saveResponseToOutput = (text: string, reasoning: string, start: number) => {
      if (text || reasoning) {
        addOutput({ type: "ai-response", streamingText: text, streamingReasoning: reasoning, startTime: start });
      }
      setStreamText("");
      setStreamReasoning("");
    };

    const maxTurns = activeConfig.maxTurns ?? 0;
    const configuredMode: PermissionMode =
      activeConfig.permissionMode && isValidPermissionMode(activeConfig.permissionMode)
        ? activeConfig.permissionMode
        : getPermissionMode();
    const permissionMode: PermissionMode =
      skipPermissions || activeConfig.dangerouslySkipPermissions
        ? "bypassPermissions"
        : planMode
          ? "plan"
          : configuredMode;
    const runnerConfig: CLIConfig = {
      ...activeConfig,
      permissionMode,
      dangerouslySkipPermissions:
        skipPermissions || activeConfig.dangerouslySkipPermissions,
      // Chat-only mode still uses the canonical stream lifecycle, but an
      // explicit deny-all rule guarantees that an accidental provider or text
      // tool call cannot execute.
      disallowedTools: (() => {
        const denied = [...(activeConfig.disallowedTools ?? [])];
        if (chatOnly) denied.push("*");
        return denied;
      })(),
    };
    const activeAgentTools = effectiveAgent?.tools;

    interface TurnBuffer {
      content: string;
      reasoning: string;
      startedAt: number;
      reasoningStartedAt?: number;
      toolStartedAt?: number;
    }

    const turnBuffers = new Map<number, TurnBuffer>();
    let autonomousTree: OutputItem | null = null;


    let allResponseText = "";
    let lastSavedTurn = 0;

    const getTurnBuffer = (turn: number): TurnBuffer => {
      const existing = turnBuffers.get(turn);
      if (existing) return existing;
      const created: TurnBuffer = {
        content: "",
        reasoning: "",
        startedAt: Date.now(),
      };
      turnBuffers.set(turn, created);
      return created;
    };

    let visibleTurn = 0;
    const streamRender = createStreamRenderScheduler(() => {
      const buffer = turnBuffers.get(visibleTurn);
      if (!buffer) return;
      setStreamText(filterToolTagsForDisplay(buffer.content));
      setStreamReasoning(buffer.reasoning);
      setStreamedChars(buffer.content.length);
    });
    const cancelStreamRender = () => streamRender.reset();
    signal.addEventListener("abort", cancelStreamRender, { once: true });

    const persistLatestPartialTurn = (): void => {
      const partialTurn = Math.max(0, ...turnBuffers.keys());
      if (partialTurn <= lastSavedTurn) return;
      const partial = turnBuffers.get(partialTurn);
      if (!partial || (!partial.content && !partial.reasoning)) return;
      saveResponseToOutput(
        filterToolTagsForDisplay(partial.content),
        partial.reasoning,
        partial.startedAt,
      );
      lastSavedTurn = partialTurn;
    };

    try {
      const result = await runAgent(newMessages, runnerConfig, cwd, {
        signal,
        initialCostUsd: getSessionCosts().totalCost,
        maxTurns: chatOnly ? 1 : maxTurns,
        enableTools: !chatOnly,
        toolAllowlist: activeAgentTools?.length ? activeAgentTools : undefined,
        onApproval: async ({ invocation, verdict }) => {
          return requestApproval({
            tool: invocation.name,
            target: invocationTarget(invocation),
            reason: verdict.reason,
            risk: verdict.risk,
          });
        },
        onEvent: (event) => {
          recordActivity(effectiveAgentId || "morningstar", event);
          switch (event.type) {
            case "swarm_start": {
              streamRender.flush();
              setIsStreaming(false);
              autonomousTree = {
                id: nextId.current++, type: "agent-tree", startTime: Date.now(), treeDone: false,
                treeTitle: `Swarm · ${event.plan.title}`,
                treeBranches: event.plan.tasks.map(t => ({ taskId: t.id, agentId: t.agentId, status: "pending", elapsedMs: 0, detail: t.description })),
              };
              setLiveTree(autonomousTree);
              break;
            }
            case "swarm_progress": {
              if (autonomousTree) { autonomousTree = { ...autonomousTree, treeBranches: event.branches }; setLiveTree(autonomousTree); }
              break;
            }
            case "swarm_activity":
              recordActivity(event.taskId, event.event);
              break;
            case "swarm_end": {
              if (autonomousTree) addOutput({ ...autonomousTree, treeDone: true, treeElapsed: Date.now() - autonomousTree.startTime! });
              autonomousTree = null;
              setLiveTree(null);
              break;
            }
            case "turn_start": {
              streamRender.reset();
              visibleTurn = event.turn;
              const buffer = getTurnBuffer(event.turn);
              buffer.startedAt = Date.now();
              setStreamText("");
              setStreamReasoning("");
              setStreamStart(buffer.startedAt);
              setStreamedChars(0);
              setThinkingStartTime(0);
              setIsStreaming(true);
              setTaskTurn(event.turn);
              setTaskMaxTurns(chatOnly ? 1 : maxTurns);
              if (event.turn > 1) {
                setTaskLabel(`Turn ${event.turn}/${maxTurns || "∞"} — AI analysiert Ergebnisse...`);
              }
              break;
            }
            case "content_delta": {
              const buffer = getTurnBuffer(event.turn);
              buffer.content += event.delta;
              allResponseText += event.delta;
              streamRender.request();
              break;
            }
            case "reasoning_delta": {
              const buffer = getTurnBuffer(event.turn);
              if (!buffer.reasoningStartedAt) buffer.reasoningStartedAt = Date.now();
              buffer.reasoning += event.delta;
              streamRender.request();
              break;
            }
            case "usage":
              setTaskTokens(prev => prev + event.usage.totalTokens);
              break;
            case "tool_requested": {
              streamRender.flush();
              const buffer = getTurnBuffer(event.turn);
              const requestedAt = Date.now();
              buffer.toolStartedAt ??= requestedAt;

              setTaskLabel(
                `Turn ${event.turn}/${chatOnly ? 1 : maxTurns || "∞"} — Executing tools...`,
              );


              break;
            }
            case "approval_required":
              setTaskLabel(`Freigabe für ${event.request.invocation.name} erforderlich...`);
              break;
            case "approval_decision":
              if (event.decision.decision === "deny") {
                setTaskLabel(`${event.decision.invocation.name} wurde verweigert`);
              }
              break;
            case "turn_end": {
              streamRender.reset();
              const buffer = getTurnBuffer(event.turn);
              if (buffer.reasoningStartedAt) {
                setThinkingStartTime(
                  Math.round((Date.now() - buffer.reasoningStartedAt) / 1000),
                );
              }
              saveResponseToOutput(
                event.text,
                buffer.reasoning,
                buffer.startedAt,
              );
              lastSavedTurn = event.turn;
              setIsStreaming(false);

              // Results are appended immediately by recordActivity, including workers.
              break;
            }
            case "completion":
              if (event.result.learned?.length) addOutput({ type: "success", content: `Gelernt für dieses Projekt:\n${event.result.learned.map(note => `  ${note}`).join("\n")}\n/learn zeigt Regeln und Nachweise.` });
              if (event.result.structuredOutputError) addOutput({ type: "error", content: `JSON-Schema nicht erfüllt: ${event.result.structuredOutputError}` });
              if (event.result.budgetExceeded) {
                addOutput({
                  type: "info",
                  content: `Budget-Limit erreicht ($${runnerConfig.maxBudgetUsd}).`,
                });
              } else if (event.result.loopDetected) {
                addOutput({
                  type: "info",
                  content: "Loop erkannt — identische Tool-Kette wurde gestoppt.",
                });
              } else if (event.result.hitTurnLimit) {
                addOutput({
                  type: "info",
                  content: `Tool-Kette nach ${event.result.turns} Runden gestoppt.`,
                });
              }
              break;
          }
        },
      });

      // An abort can end a turn before `turn_end`; preserve any partial output.
      persistLatestPartialTurn();

      if (allResponseText || result.usage.totalTokens > 0) {
        trackUsage(
          activeConfig.model,
          userContent,
          allResponseText || result.finalText,
          result.usage.inputTokens,
          result.usage.outputTokens,
          activeConfig.provider,
        );
      }
      setTaskTokens(result.usage.totalTokens);

      // Repository tests execute project-controlled code. Resolve the exact
      // argv first, then pass it through the same Bash policy and approval UI
      // instead of treating tests as an implicit side effect of an edit.
      if (!result.aborted && !signal.aborted) {
        const seenTestCommands = new Set<string>();
        for (const toolResult of result.toolCalls) {
          if (
            !toolResult.success
            || (toolResult.tool !== "write" && toolResult.tool !== "edit")
            || !toolResult.filePath
          ) {
            continue;
          }
          const testInfo = shouldAutoTest(toolResult.filePath, cwd);
          if (!testInfo.testFile && !testInfo.runAll) continue;
          const plan = planAgentTestRun(
            cwd,
            testInfo.testFile || undefined,
            activeAgentTools,
          );
          if (!plan || seenTestCommands.has(plan.command)) continue;
          if (activeConfig.toolAllowlist && !activeConfig.toolAllowlist.some((tool) => tool.toLowerCase() === "bash")) continue;
          seenTestCommands.add(plan.command);

          const verdict = decidePermission(
            "bash",
            plan.command,
            permissionMode,
            activeConfig.allowedTools,
            activeConfig.disallowedTools,
            activeConfig.askTools,
            activeConfig.disableBypassPermissions,
            cwd,
          );
          let approved = verdict.decision === "allow";
          if (verdict.decision === "ask") {
            approved = await requestApproval({
              tool: "bash",
              target: plan.command,
              reason: `Auto-Test führt Repository-Code aus: ${verdict.reason}`,
              risk: verdict.risk,
            });
          }
          if (!approved || verdict.decision === "deny" || signal.aborted) {
            addOutput({
              type: "info",
              content: `Auto-Test nicht ausgeführt: ${plan.command}`,
            });
            continue;
          }

          const testResult = runTestPlan(cwd, plan, 30000);
          addOutput({
            type: testResult.passed ? "success" : "error",
            content: formatTestResult(testResult),
          });
        }
      }

      const assistantText =
        result.finalText
        || (result.toolCalls.length === 0 ? allResponseText : "");
      if (result.aborted || signal.aborted) {
        setMessages([
          ...(result.messages ?? newMessages),
          { role: "assistant" as const, content: steeringRef.current ? "[Für eine neue Nutzernachricht unterbrochen. Der bisherige Auftrag bleibt aktiv; neue Hinweise berücksichtigen.]" : ABORTED_TURN_MARKER },
        ]);
      } else if (result.messages) {
        setMessages(result.messages);
      } else if (assistantText) {
        setMessages([
          ...newMessages,
          { role: "assistant" as const, content: assistantText },
        ]);
      }
    } catch (e) {
      persistLatestPartialTurn();
      if (signal.aborted) {
        setMessages([
          ...newMessages,
          { role: "assistant" as const, content: steeringRef.current ? "[Für eine neue Nutzernachricht unterbrochen. Der bisherige Auftrag bleibt aktiv; neue Hinweise berücksichtigen.]" : ABORTED_TURN_MARKER },
        ]);
      } else {
        const errorMessage = (e as Error).message;
        addOutput({ type: "error", content: `Fehler: ${errorMessage}` });
        setMessages([
          ...newMessages,
          {
            role: "assistant" as const,
            content: `[Der vorherige Lauf ist mit einem Fehler beendet worden: ${errorMessage}]`,
          },
        ]);
      }
    } finally {
      streamRender.reset();
      signal.removeEventListener("abort", cancelStreamRender);
      setIsProcessing(false);
      setIsStreaming(false);
      setStreamText("");
      setStreamReasoning("");


      setTaskLabel("");
      setTaskTurn(0);
      setTaskTokens(0);
      abortRef.current = null;
      steeringRef.current = false;
    }
  }, [messages, config, activeAgent, activeSkill, planMode, thinkMode, debugMode, chatOnly, cwd, customCommands, requestApproval, skipPermissions, pendingCdChoices, isProcessing]);

  const allBranches = [...new Map([
    ...output.flatMap(o => o.treeBranches ?? []), ...(liveTree?.treeBranches ?? []), ...backendAgents,
  ].map(b => [b.taskId ?? b.agentId, b])).values()].map(b => {
    const note = agentNotes.current.get(b.taskId ?? b.agentId);
    return { ...b, detail: [note?.task, b.detail, note?.text].filter(Boolean).join("\n\n") };
  });
  remoteBridge.current = {
    snapshot: () => ({
      id: session.id, name: session.name, model: config.model, project: cwd, busy: isProcessing || commandBusy.current, stream: displayText(streamText),
      messages: messages.filter(m => ["user", "assistant"].includes(m.role) && !m.contextKind && m.content.trim()).slice(-100).map(m => ({ role: m.role, content: displayText(m.content).slice(0, 32000) })),
      agents: allBranches.map(b => ({ ...b, taskId: b.taskId ?? b.agentId })),
      timeline: remoteTimeline(output),
      work: output.filter(o => o.type === "work-log").slice(-100).flatMap(o => (o.toolResults ?? []).map(r => ({ agent: o.toolLabel ?? "morningstar", heading: displayText(workHeading(r)), success: r.success, output: displayText(r.result).slice(0, 16000), change: r.diff ? fileChange(r.diff.oldStr, r.diff.newStr) : undefined }))),
      approval: pendingApproval && approvalId.current ? { id: approvalId.current, tool: pendingApproval.tool, target: pendingApproval.target, reason: pendingApproval.reason } : null,
    }),
    action: a => {
      if (a.type === "stop") { abortRef.current?.abort(); cancelApprovals(); return; }
      if (a.type === "approve") { if (!approvalResolverRef.current || a.approvalId !== approvalId.current) throw new Error("Diese Freigabe ist nicht mehr aktuell."); resolveApproval(a.allow!); return; }
      if (isProcessing || commandBusy.current) throw new Error("Morningstar arbeitet noch. Zuerst stoppen oder den Abschluss abwarten.");
      if (showModelPicker || showLoginPicker || pendingKeyOption || oauthRunning || showSessionPicker || showRewind || showRemoteMenu) throw new Error("Schliesse zuerst den Dialog im Terminal.");
      if (a.type === "new") { changeSession("new"); return; }
      if (a.type === "resume") { changeSession("resume", a.sessionId); return; }
      if (a.type === "rename") { renameSession(a.text!); return; }
      const pending = processInput(a.text!);
      commandBusy.current = true;
      void pending.finally(() => { commandBusy.current = false; });
    },
  };

  const initialPromptSent = useRef(false);
  useEffect(() => {
    if (!initialPrompt || initialPromptSent.current) return;
    initialPromptSent.current = true;
    void processInput(initialPrompt);
  }, [initialPrompt, processInput]);

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
            <Text wrap="wrap"><ImageText text={item.content ?? ""} /></Text>
          </Box>
        );
      case "remote-pairing":
        return <RemotePairing key={item.id} url={item.pairUrl!} label={item.content ?? ""} />;
      case "notice":
        return <Box key={item.id} marginLeft={2} marginY={1}><Text color={accent}>Hinweis · {item.content}</Text></Box>;
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
            startLineNumber={item.startLineNumber}
          />
        );
      case "tool-group":
        return (
          <ToolGroup
            key={item.id}
            results={item.toolResults || []}
            duration={item.toolDuration || 0}
            tokenCount={item.toolTokens || 0}
            expanded={item.expanded ?? true}
            toolUseCount={item.toolCount || 0}
          />
        );
      case "work-log":
        return <WorkLog key={item.id} results={item.toolResults || []} agent={item.toolLabel} />;
      case "tool-activity":
        return (
          <Box key={item.id} marginLeft={2}>
            <Text color={info} bold>{"⏺ "}</Text>
            <Text color={info}>{item.content}</Text>
            <Text color={dim}>{" …"}</Text>
          </Box>
        );
      case "agent-tree":
        return (
          <AgentTree
            key={item.id}
            title={item.treeTitle || "parallel agents"}
            branches={item.treeBranches || []}
            startTime={item.startTime || Date.now()}
            done={item.treeDone}
            elapsedMs={item.treeElapsed}
          />
        );
      default:
        return null;
    }
  }

  // ── Render ──
  return (
    <>
      {/* Static output — rendered once, scrolls naturally, no re-render flicker */}
      <Static key={sessionEpoch} items={output}>
        {(item) => renderOutputItem(item)}
      </Static>

      {/* Dynamic area — streaming + input, always at bottom */}
      <TerminalDock>
        <Box flexDirection="column" flexShrink={1} overflowY="hidden">
        {showIntro ? <StartupBanner config={config} ctx={ctx} skipPermissions={skipPermissions} onDone={finishIntro} /> : null}
        {liveTree && !inspectedAgent ? renderOutputItem(liveTree) : null}
        {/* Streaming output */}
        {!inspectedAgent && isStreaming && !streamText && !streamReasoning && (
          <MorningstarSpinner startTime={streamStart} streamedChars={streamedChars} thinkingTime={thinkingStartTime > 0 ? thinkingStartTime : undefined} />
        )}

        {!inspectedAgent && (streamText || streamReasoning) && (
          <StreamingOutput
            text={streamText}
            reasoning={streamReasoning}
            isStreaming={isStreaming}
            startTime={streamStart}
          />
        )}

        {!inspectedAgent ? <ActivityFeed entries={activity} active={isProcessing} label={liveTree ? undefined : taskLabel} turn={liveTree ? 0 : taskTurn} maxTurns={taskMaxTurns} /> : null}

        {pendingApproval ? (
          <ApprovalPrompt
            tool={pendingApproval.tool}
            target={pendingApproval.target}
            reason={pendingApproval.reason}
            risk={pendingApproval.risk}
            onDecision={resolveApproval}
          />
        ) : null}

        {showModelPicker ? (
          <ModelPicker
            currentModel={config.model}
            currentProvider={config.provider || detectProvider(config.model)}
            hasCredential={(provider) =>
              KEYLESS_PROVIDERS.has(provider)
              || Boolean(getStoredApiKey(provider))}
            onSelect={(model, provider) => {
              const nextConfig = buildModelSwitchConfig(
                config,
                model,
                provider,
                getStoredApiKey,
              );
              setConfig(nextConfig);
              saveConfig({ model, provider, baseUrl: nextConfig.baseUrl });
              setShowModelPicker(false);
              addOutput({
                type: "success",
                content: `Model: ${getModelDisplayName(model)} [${provider}]`,
              });
            }}
            onCancel={() => setShowModelPicker(false)}
          />
        ) : null}

        {oauthRunning ? (
          <Box marginY={1} marginX={1}>
            <Text color={accent}>
              {`Anmeldung läuft in ${oauthRunning} — Browser folgen, danach hierher zurück.`}
            </Text>
          </Box>
        ) : null}

        {showLoginPicker && !oauthRunning ? (
          authGroups === null ? (
            <Box marginY={1} marginX={1}>
              <Text color={dim}>Prüfe Anmeldungen …</Text>
            </Box>
          ) : (
            <LoginPicker
              groups={authGroups}
              activeProvider={config.provider || detectProvider(config.model)}
              onSelect={handleAuthSelect}
              onCancel={() => setShowLoginPicker(false)}
            />
          )
        ) : null}

        {pendingKeyOption ? (
          <SecretInput
            label={`${pendingKeyOption.vendor} · API-Key`}
            hint={pendingKeyOption.envKey
              ? `Alternativ dauerhaft: export ${pendingKeyOption.envKey}=<key>`
              : undefined}
            onSubmit={(key) => {
              const option = pendingKeyOption;
              setPendingKeyOption(null);
              if (!key) {
                addOutput({ type: "info", content: "Kein Key eingegeben — abgebrochen." });
                return;
              }
              storeApiKey(option.provider, key);
              activateAuthOption(option);
            }}
            onCancel={() => {
              setPendingKeyOption(null);
              addOutput({ type: "info", content: "Login abgebrochen." });
            }}
          />
        ) : null}

        {showRemoteMenu && remoteRef.current ? <RemoteControlPanel url={remoteRef.current.url} onChoose={choice => { setShowRemoteMenu(false); if (choice !== "close") void remoteCommand(choice).catch(error => addOutput({ type: "error", content: error.message })); }} /> : null}
        {showRewind ? <RewindPicker messages={messages} busy={isProcessing} onChoose={(index, action) => { void applyRewind(index, action); }} onClose={() => { if (isProcessing) abortRef.current?.abort(); else setShowRewind(false); }} /> : null}
        {showSessionPicker ? <SessionPicker sessions={session.list()} onSelect={id => { try { changeSession("resume", id); } catch (error) { addOutput({ type: "error", content: (error as Error).message }); } }} onClose={() => setShowSessionPicker(false)} /> : null}
        <AgentTabs branches={allBranches} selected={inspectedAgent} onSelect={setInspectedAgent} />
        {inspectedAgent ? <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
          <Text bold color={accent}>{displayText(allBranches.find(b => (b.taskId ?? b.agentId) === inspectedAgent)?.agentId ?? inspectedAgent)}</Text>
          <Text>{displayText(allBranches.find(b => (b.taskId ?? b.agentId) === inspectedAgent)?.detail ?? "").slice(0, 1600)}</Text>
          <ActivityFeed entries={activity.filter(e => e.agent === inspectedAgent)} active={isProcessing} />
          {output.filter(o => o.type === "work-log" && o.toolLabel === inspectedAgent).slice(-1).map(renderOutputItem)}
        </Box> : null}
        </Box>
        <TerminalLiveFooter>
        {isProcessing ? <Text color={dim} wrap="truncate"> {liveTree && !liveTree.treeDone ? liveTree.treeTitle : taskLabel || "Morningstar arbeitet"}{taskTurn ? ` · Schritt ${taskTurn}` : ""}</Text> : null}
        {/* Input */}
        <Box marginTop={0}>
          <Input
            key={sessionEpoch}
            initialValue={inputDraft}
            seedImages={[...messages.flatMap(m => m.images ?? []), ...draftImages]}
            onSendNow={() => { if (abortRef.current) { steeringRef.current = true; abortRef.current.abort(); cancelApprovals(); setTaskLabel("Neue Nachricht wird übernommen..."); } }}
            onSubmit={processInput}
            onSelectionChange={updateSelection}
            onHistorySearchChange={updateHistorySearch}
            onCancel={() => {
              if (abortRef.current && !abortRef.current.signal.aborted) {
                abortRef.current.abort(); cancelApprovals(); setIsStreaming(false);
                setTaskLabel("Wird abgebrochen...");
                addOutput({ type: "info", content: "Abgebrochen." });
              }
            }}
            activeAgent={activeAgent}
            planMode={planMode}
            permissionMode={interactionMode}
            modeLocked={Boolean(config.runtimeSettings?.managedPermissionMode)}
            onCycleMode={reverse => applyInteractionMode(cycleInteractionMode(interactionMode, reverse, config.disableBypassPermissions, config.runtimeSettings?.managedPermissionMode))}
            thinkMode={thinkMode}
            isProcessing={isProcessing}
            suggestions={slashCommands}
            vimMode={vimMode}
            cwd={cwd}
            isActive={!showRemoteMenu && !showRewind
              && !showSessionPicker
              && !pendingApproval
              && !showModelPicker
              && !showLoginPicker
              && !pendingKeyOption
              && !oauthRunning}
          />
        </Box>

        {/* ── Bottom Status Bar ── */}
        {showStatusLine && (
          <>
            <StatusLine
              cwd={cwd}
              model={config.model}
              provider={config.provider || detectProvider(config.model)}
              activeAgent={activeAgent}
              activeSkill={activeSkill?.name || null}
              vimMode={vimMode}
              fastMode={Boolean(config.fast)}
              debugMode={debugMode}
              remainingBudget={config.maxBudgetUsd ? getRemainingBudget(config.maxBudgetUsd) : undefined}
            />
            {terminalDensity === "wide" ? (
              <Box marginLeft={1}>
                <ContextRadar messages={messages} />
              </Box>
            ) : null}
          </>
        )}
        </TerminalLiveFooter>
      </TerminalDock>
    </>
  );
}
