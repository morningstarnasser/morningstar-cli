// ─── Shared Headless Agentic Engine ──────────────────────────────────────────
// Canonical model -> authorization -> tool -> feedback loop used by every
// non-interactive runtime. Provider-native and text tool calls are normalized
// into the same invocation contract before policy evaluation.

import { streamChat as realStreamChat } from "./ai.js";
import {
  executeNativeToolCall as realExecuteNativeToolCall,
  executeToolCall as realExecuteToolCall,
  parseToolCalls,
} from "./tools.js";
import { decidePermission } from "./policy-engine.js";
import { getCostPerMessage } from "./cost-tracker.js";
import type { Decision, PolicyVerdict } from "./policy-engine.js";
import type { PermissionMode } from "./permissions.js";
import type { Message, CLIConfig, ToolResult } from "./types.js";
import type { ParsedToolCall } from "./tools.js";
import type { StreamToken, UsageData } from "./providers.js";

const DEFAULT_MAX_TURNS = 12;
const LOOP_SENSITIVE_TOOLS = new Set([
  "write",
  "edit",
  "delete",
  "bash",
  "gh",
  "notebook_edit",
  "create",
  "mkdir",
  "auto-bash",
  "auto-python",
  "auto-html",
  "jerry",
]);

export type StreamFn = (
  messages: Message[],
  config: CLIConfig,
  signal?: AbortSignal,
  enableTools?: boolean,
) => AsyncGenerator<StreamToken>;

/**
 * Legacy whole-response executor seam. It is retained for existing consumers
 * and tests; new integrations should inject the per-invocation executors.
 */
export type ToolExecFn = (
  response: string,
  cwd: string,
) => Promise<{ results: ToolResult[]; cleanResponse: string }>;

export type TextToolExecFn = (
  call: ParsedToolCall,
  cwd: string,
  signal?: AbortSignal,
) => ToolResult | Promise<ToolResult>;

export type NativeToolExecFn = (
  name: string,
  args: Record<string, unknown>,
  cwd: string,
  signal?: AbortSignal,
) => ToolResult | Promise<ToolResult>;

export interface ToolInvocation {
  /** Provider call id, or a deterministic runner-generated id for text calls. */
  id: string;
  /** Normalized lower-case tool name used for policy and execution. */
  name: string;
  /** Parsed arguments shared by text and native calls. */
  args: Record<string, unknown>;
  source: "text" | "native" | "legacy";
  /** Original text fragment or provider argument string, when available. */
  raw?: string;
  /** Invalid arguments are represented as an invocation and fail without execution. */
  parseError?: string;
}

export interface ToolApprovalRequest {
  turn: number;
  invocation: ToolInvocation;
  verdict: PolicyVerdict;
}

export type ToolApprovalResponse =
  | boolean
  | { approved: boolean; reason?: string };

export interface ApprovalDecision {
  turn: number;
  invocation: ToolInvocation;
  decision: Extract<Decision, "allow" | "deny">;
  source: "policy" | "user" | "missing_callback";
  reason: string;
}

export type AgentLifecycleEvent =
  | { type: "turn_start"; turn: number }
  | { type: "content_delta"; turn: number; delta: string }
  | { type: "reasoning_delta"; turn: number; delta: string }
  | { type: "tool_requested"; turn: number; invocation: ToolInvocation }
  | { type: "approval_required"; request: ToolApprovalRequest }
  | { type: "approval_decision"; decision: ApprovalDecision }
  | { type: "tool_result"; turn: number; invocation: ToolInvocation; result: ToolResult }
  | { type: "usage"; turn: number; usage: UsageData }
  | { type: "turn_end"; turn: number; text: string; tools: ToolResult[] }
  | { type: "completion"; result: AgentRunResult };

export interface AgentRunOptions {
  /** Hard cap on model<->tool round trips. Default 12. */
  maxTurns?: number;
  /** External abort signal (e.g. user pressed /stop). */
  signal?: AbortSignal;
  /** Cost already spent before this run (used for a session-wide budget). */
  initialCostUsd?: number;
  /** Disable provider tool advertisement for pure chat/read-only surfaces. */
  enableTools?: boolean;
  /**
   * Optional capability allowlist for a selected agent. This is enforced on
   * every normalized invocation (native, text, and compatibility calls) before
   * policy evaluation or any approval prompt.
   */
  toolAllowlist?: readonly string[];
  /** Called with each reasoning/thinking delta as it streams. */
  onReasoning?: (delta: string) => void;
  /** Called with each content delta as it streams. */
  onContent?: (delta: string) => void;
  /** Called once per turn after tools ran, with the turn's clean text + tools. */
  onTurnEnd?: (cleanText: string, tools: ToolResult[]) => void;
  /** Called for every individual tool result. */
  onTool?: (tool: ToolResult) => void;
  /** Receive every typed lifecycle event in emission order. */
  onEvent?: (event: AgentLifecycleEvent) => void;
  onTurnStart?: (turn: number) => void;
  onToolRequested?: (invocation: ToolInvocation, turn: number) => void;
  onApprovalRequired?: (request: ToolApprovalRequest) => void;
  onApprovalDecision?: (decision: ApprovalDecision) => void;
  onUsage?: (usage: UsageData, turn: number) => void;
  onComplete?: (result: AgentRunResult) => void;
  /**
   * Resolve an `ask` verdict. Missing callbacks deny fail-closed. Throwing
   * callbacks are also treated as denial.
   */
  onApproval?: (
    request: ToolApprovalRequest,
  ) => ToolApprovalResponse | Promise<ToolApprovalResponse>;
  /** Inject a fake model stream (tests). Defaults to the real provider. */
  streamFn?: StreamFn;
  /** Legacy whole-response executor retained for compatibility. */
  toolExecFn?: ToolExecFn;
  /** Inject the normalized text-call executor. */
  textToolExecFn?: TextToolExecFn;
  /** Inject the provider-native executor. */
  nativeToolExecFn?: NativeToolExecFn;
}

export interface AgentRunResult {
  /** The model's final natural-language answer (tool tags stripped). */
  finalText: string;
  /** Number of model turns executed. */
  turns: number;
  /** Every tool result produced across all turns, in order. */
  toolCalls: ToolResult[];
  /** Aggregate provider usage across turns. */
  usage: UsageData;
  /** Estimated billed cost incurred by this run. */
  costUsd: number;
  /** True when maxBudgetUsd stopped this run before another model/tool turn. */
  budgetExceeded: boolean;
  /** True if the run was cut short by the abort signal. */
  aborted: boolean;
  /** True if the run hit the maxTurns cap while still calling tools. */
  hitTurnLimit: boolean;
  /** True if an identical tool batch was requested in consecutive turns. */
  loopDetected: boolean;
}

interface PendingInvocation {
  invocation: ToolInvocation;
  parsedCall?: ParsedToolCall;
}

function emptyUsage(): UsageData {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(total: UsageData, usage: UsageData): UsageData {
  const reasoningTokens =
    usage.reasoningTokens === undefined
      ? total.reasoningTokens
      : (total.reasoningTokens ?? 0) + usage.reasoningTokens;
  const cacheHitTokens =
    usage.cacheHitTokens === undefined
      ? total.cacheHitTokens
      : (total.cacheHitTokens ?? 0) + usage.cacheHitTokens;
  return {
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(cacheHitTokens === undefined ? {} : { cacheHitTokens }),
  };
}

function resolvePermissionMode(
  config: CLIConfig,
  preserveLegacyBehavior: boolean,
): PermissionMode {
  if (config.dangerouslySkipPermissions) return "bypassPermissions";
  if (config.permissionMode) return config.permissionMode as PermissionMode;
  // Existing injected whole-response executors historically ran without a
  // policy mode. Preserve that test/integration seam only; real execution is
  // fail-closed by default.
  return preserveLegacyBehavior ? "bypassPermissions" : "ask";
}

function safeParseNativeArguments(raw: string): {
  args: Record<string, unknown>;
  error?: string;
} {
  if (!raw.trim()) return { args: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      return { args: {}, error: "Native tool arguments must be a JSON object." };
    }
    return { args: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      args: {},
      error: `Invalid native tool arguments: ${(error as Error).message}`,
    };
  }
}

function argumentTarget(
  args: Record<string, unknown>,
  toolName?: string,
): string {
  if (toolName?.startsWith("mcp__")) {
    try {
      return JSON.stringify(stableValue(args));
    } catch {
      return "";
    }
  }
  const preferred = [
    "command",
    "filePath",
    "dirPath",
    "url",
    "query",
    "pattern",
    "taskId",
    "raw",
  ];
  for (const key of preferred) {
    const value = args[key];
    if (typeof value === "string") return value;
  }
  try {
    return JSON.stringify(args);
  } catch {
    return "";
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function invocationSignature(invocations: PendingInvocation[]): string {
  return JSON.stringify(
    invocations.map(({ invocation }) => ({
      name: invocation.name,
      args: stableValue(invocation.args),
      parseError: invocation.parseError,
    })),
  );
}

function invocationIdentity(invocation: ToolInvocation): string {
  return JSON.stringify({
    name: invocation.name,
    args: stableValue(invocation.args),
    parseError: invocation.parseError,
  });
}

function deniedResult(invocation: ToolInvocation, reason: string): ToolResult {
  return {
    tool: invocation.name,
    result: `Permission denied: ${reason}`,
    success: false,
  };
}

function errorResult(invocation: ToolInvocation, reason: string): ToolResult {
  return { tool: invocation.name, result: reason, success: false };
}

function normalizeApproval(response: ToolApprovalResponse): {
  approved: boolean;
  reason?: string;
} {
  return typeof response === "boolean" ? { approved: response } : response;
}

async function resolveApprovalWithAbort(
  callback: NonNullable<AgentRunOptions["onApproval"]>,
  request: ToolApprovalRequest,
  signal?: AbortSignal,
): Promise<
  | { aborted: true }
  | { aborted: false; response: ToolApprovalResponse }
> {
  if (signal?.aborted) return { aborted: true };
  if (!signal) {
    return { aborted: false, response: await callback(request) };
  }

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<{ aborted: true }>((resolve) => {
    onAbort = () => resolve({ aborted: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([
      Promise.resolve(callback(request)).then(
        (response) => ({ aborted: false as const, response }),
      ),
      aborted,
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Run the agentic loop to completion. The input message array is never mutated.
 * All executors are reached only after a final allow decision.
 */
export async function runAgent(
  messages: Message[],
  config: CLIConfig,
  cwd: string,
  options: AgentRunOptions = {},
): Promise<AgentRunResult> {
  const maxTurns = Math.max(0, options.maxTurns ?? config.maxTurns ?? DEFAULT_MAX_TURNS);
  const streamFn = options.streamFn ?? realStreamChat;
  const textToolExecFn = options.textToolExecFn ?? realExecuteToolCall;
  const nativeToolExecFn = options.nativeToolExecFn ?? realExecuteNativeToolCall;
  const signal = options.signal;
  const toolAllowlist = options.toolAllowlist
    ? new Set(options.toolAllowlist.map((tool) => tool.toLowerCase()))
    : undefined;

  let conversation: Message[] = [...messages];
  let finalText = "";
  const toolCalls: ToolResult[] = [];
  let usage = emptyUsage();
  let costUsd = 0;
  let budgetExceeded = false;
  let turns = 0;
  let hitTurnLimit = false;
  let loopDetected = false;
  let previousInvocationSignature = "";

  const emit = (event: AgentLifecycleEvent): void => {
    options.onEvent?.(event);
    switch (event.type) {
      case "turn_start":
        options.onTurnStart?.(event.turn);
        break;
      case "tool_requested":
        options.onToolRequested?.(event.invocation, event.turn);
        break;
      case "approval_required":
        options.onApprovalRequired?.(event.request);
        break;
      case "approval_decision":
        options.onApprovalDecision?.(event.decision);
        break;
      case "usage":
        options.onUsage?.(event.usage, event.turn);
        break;
      default:
        break;
    }
  };

  const complete = (
    aborted: boolean,
  ): AgentRunResult => {
    const result: AgentRunResult = {
      finalText: finalText.trim(),
      turns,
      toolCalls,
      usage,
      costUsd,
      budgetExceeded,
      aborted,
      hitTurnLimit,
      loopDetected,
    };
    emit({ type: "completion", result });
    options.onComplete?.(result);
    return result;
  };

  for (let turnIndex = 0; turnIndex < maxTurns; turnIndex++) {
    if (signal?.aborted) return complete(true);
    if (
      config.maxBudgetUsd !== undefined
      && (options.initialCostUsd ?? 0) + costUsd >= config.maxBudgetUsd
    ) {
      budgetExceeded = true;
      if (!finalText) finalText = "Budget-Limit erreicht.";
      return complete(false);
    }

    const turn = turnIndex + 1;
    turns = turn;
    emit({ type: "turn_start", turn });

    let response = "";
    const nativeCalls = new Map<string, { id: string; name: string; arguments: string }>();
    let anonymousNativeCall = 0;

    try {
      // `true` is intentional: every supporting provider should expose native
      // tools to the canonical runner.
      for await (const token of streamFn(
        conversation,
        config,
        signal,
        options.enableTools ?? true,
      )) {
        if (signal?.aborted) return complete(true);
        if (token.type === "content") {
          response += token.text;
          options.onContent?.(token.text);
          emit({ type: "content_delta", turn, delta: token.text });
        } else if (token.type === "reasoning") {
          options.onReasoning?.(token.text);
          emit({ type: "reasoning_delta", turn, delta: token.text });
        } else if (token.type === "usage" && token.usage) {
          usage = addUsage(usage, token.usage);
          costUsd += getCostPerMessage(
            config.model,
            token.usage.inputTokens,
            token.usage.outputTokens,
            config.provider,
          );
          emit({ type: "usage", turn, usage: token.usage });
          if (
            config.maxBudgetUsd !== undefined
            && (options.initialCostUsd ?? 0) + costUsd >= config.maxBudgetUsd
          ) {
            budgetExceeded = true;
            break;
          }
        } else if (token.type === "tool_call" && token.toolCall) {
          const call = token.toolCall;
          const key = call.id || `${call.name}:${anonymousNativeCall++}`;
          const existing = nativeCalls.get(key);
          if (existing) {
            nativeCalls.set(key, {
              ...existing,
              name: call.name || existing.name,
              arguments: existing.arguments + call.arguments,
            });
          } else {
            nativeCalls.set(key, {
              id: call.id || `native-${turn}-${anonymousNativeCall}`,
              name: call.name,
              arguments: call.arguments,
            });
          }
        }
      }
    } catch (error) {
      if (signal?.aborted || (error as Error).name === "AbortError") return complete(true);
      throw error;
    }

    if (signal?.aborted) {
      if (response) finalText = response;
      return complete(true);
    }
    if (budgetExceeded) {
      finalText = response || "Budget-Limit erreicht.";
      return complete(false);
    }

    const parsedText = parseToolCalls(response);
    finalText = parsedText.cleanResponse || (parsedText.calls.length === 0 ? response : "");
    const parsedInvocations: PendingInvocation[] = parsedText.calls.map((call, index) => ({
      invocation: {
        id: `text-${turn}-${index + 1}`,
        name: call.tool.toLowerCase(),
        args: call.args,
        source: "text",
        raw: call.raw,
        parseError: call.error,
      },
      parsedCall: call,
    }));

    for (const native of nativeCalls.values()) {
      const parsed = safeParseNativeArguments(native.arguments);
      parsedInvocations.push({
        invocation: {
          id: native.id,
          name: native.name.toLowerCase(),
          args: parsed.args,
          source: "native",
          raw: native.arguments,
          parseError: parsed.error,
        },
      });
    }

    // Providers can occasionally emit the same action as both a fallback
    // <tool:...> tag and a native function call. Run that exact action once,
    // retaining the native invocation so its provider call id gets a result.
    const nativeInvocationIdentities = new Set(
      parsedInvocations
        .filter(({ invocation }) => invocation.source === "native")
        .map(({ invocation }) => invocationIdentity(invocation)),
    );
    const pending = parsedInvocations.filter(({ invocation }) =>
      invocation.source !== "text"
      || !nativeInvocationIdentities.has(invocationIdentity(invocation)));

    // Compatibility discovery for injected whole-response executors. Standard
    // calls never need this path because they were parsed above.
    const useOpaqueLegacyExecutor =
      options.toolExecFn !== undefined && pending.length === 0;
    if (useOpaqueLegacyExecutor) {
      pending.push({
        invocation: {
          id: `legacy-${turn}`,
          name: "legacy",
          args: { raw: response },
          source: "legacy",
          raw: response,
        },
      });
    }

    const signature = invocationSignature(pending);
    const canDetectLoop = pending.some(
      ({ invocation }) =>
        invocation.source !== "legacy"
        && (
          LOOP_SENSITIVE_TOOLS.has(invocation.name)
          || invocation.name.startsWith("mcp__")
        ),
    );
    if (
      canDetectLoop
      && pending.length > 0
      && signature === previousInvocationSignature
    ) {
      loopDetected = true;
      const loopResults = pending.map(({ invocation }) => {
        emit({ type: "tool_requested", turn, invocation });
        const result = errorResult(
          invocation,
          "Loop detected: identical tool invocation repeated in consecutive turns.",
        );
        toolCalls.push(result);
        options.onTool?.(result);
        emit({ type: "tool_result", turn, invocation, result });
        return result;
      });
      options.onTurnEnd?.(finalText, loopResults);
      emit({ type: "turn_end", turn, text: finalText, tools: loopResults });
      break;
    }
    previousInvocationSignature =
      canDetectLoop && pending.length > 0 ? signature : "";

    const turnResults: ToolResult[] = [];
    const nativeResults: Array<{
      invocation: ToolInvocation;
      result: ToolResult;
    }> = [];
    const invocationResults: Array<{
      invocation: ToolInvocation;
      result: ToolResult;
    }> = [];
    for (const item of pending) {
      if (signal?.aborted) return complete(true);
      const { invocation } = item;
      emit({ type: "tool_requested", turn, invocation });

      const verdict: PolicyVerdict = toolAllowlist && !toolAllowlist.has(invocation.name)
        ? {
            decision: "deny",
            risk: "high",
            reason: `tool "${invocation.name}" is outside the active agent allowlist`,
          }
        : decidePermission(
            invocation.name,
            argumentTarget(invocation.args, invocation.name),
            resolvePermissionMode(
              config,
              options.toolExecFn !== undefined && invocation.source !== "native",
            ),
            config.allowedTools,
            config.disallowedTools,
          );

      let approved = verdict.decision === "allow";
      let approvalDecision: ApprovalDecision;
      if (verdict.decision === "ask") {
        const request: ToolApprovalRequest = { turn, invocation, verdict };
        emit({ type: "approval_required", request });
        if (!options.onApproval) {
          approvalDecision = {
            turn,
            invocation,
            decision: "deny",
            source: "missing_callback",
            reason: "approval required but no approval callback was provided",
          };
        } else {
          try {
            const approval = await resolveApprovalWithAbort(
              options.onApproval,
              request,
              signal,
            );
            if (approval.aborted) {
              approvalDecision = {
                turn,
                invocation,
                decision: "deny",
                source: "user",
                reason: "agent run aborted while awaiting approval",
              };
              emit({ type: "approval_decision", decision: approvalDecision });
              return complete(true);
            }
            const answer = normalizeApproval(approval.response);
            approved = answer.approved;
            approvalDecision = {
              turn,
              invocation,
              decision: approved ? "allow" : "deny",
              source: "user",
              reason: answer.reason
                ?? (approved ? "approved by callback" : "denied by callback"),
            };
          } catch (error) {
            approved = false;
            approvalDecision = {
              turn,
              invocation,
              decision: "deny",
              source: "user",
              reason: `approval callback failed: ${(error as Error).message}`,
            };
          }
        }
      } else {
        approvalDecision = {
          turn,
          invocation,
          decision: verdict.decision,
          source: "policy",
          reason: verdict.reason,
        };
      }
      emit({ type: "approval_decision", decision: approvalDecision });
      if (signal?.aborted) return complete(true);

      let results: ToolResult[];
      if (!approved) {
        results = [deniedResult(invocation, approvalDecision.reason)];
      } else if (invocation.parseError) {
        results = [errorResult(invocation, invocation.parseError)];
      } else {
        try {
          if (invocation.source === "native") {
            results = [
              await Promise.resolve(
                nativeToolExecFn(invocation.name, invocation.args, cwd, signal),
              ),
            ];
          } else if (options.toolExecFn) {
            const legacy = await options.toolExecFn(
              invocation.source === "legacy"
                ? response
                : (invocation.raw ?? ""),
              cwd,
            );
            results = legacy.results;
            if (invocation.source === "legacy" && legacy.cleanResponse) {
              finalText = legacy.cleanResponse;
            }
          } else {
            results = [
              await Promise.resolve(
                textToolExecFn(item.parsedCall!, cwd, signal),
              ),
            ];
          }
        } catch (error) {
          results = [
            errorResult(
              invocation,
              `Tool execution failed: ${(error as Error).message}`,
            ),
          ];
        }
      }

      if (signal?.aborted) return complete(true);

      for (const result of results) {
        turnResults.push(result);
        invocationResults.push({ invocation, result });
        toolCalls.push(result);
        if (invocation.source === "native") {
          nativeResults.push({ invocation, result });
        }
        options.onTool?.(result);
        emit({ type: "tool_result", turn, invocation, result });
      }
    }

    options.onTurnEnd?.(finalText, turnResults);
    emit({ type: "turn_end", turn, text: finalText, tools: turnResults });

    if (turnResults.length === 0) break;

    const toolFeedback = turnResults
      .map((result) =>
        `[Tool: ${result.tool}] ${result.success ? "Success" : "Error"}: ${result.result}`)
      .join("\n\n");

    const nativeResultIds = new Set(
      nativeResults.map(({ invocation }) => invocation.id),
    );
    const nativeAssistant =
      nativeResults.length > 0
        ? [{
            role: "assistant" as const,
            content: parsedText.cleanResponse,
            toolCalls: pending
              .filter(({ invocation }) =>
                invocation.source === "native"
                && nativeResultIds.has(invocation.id))
              .map(({ invocation }) => ({
                id: invocation.id,
                name: invocation.name,
                arguments: invocation.args,
              })),
          }]
        : [{ role: "assistant" as const, content: response }];
    const nativeToolMessages = nativeResults.map(({ invocation, result }) => ({
      role: "tool" as const,
      content: result.result,
      toolCallId: invocation.id,
      toolName: invocation.name,
      isError: !result.success,
    }));
    const textResults = invocationResults
      .filter(({ invocation }) => invocation.source !== "native")
      .map(({ result }) => result);
    const continuationPrompt =
      "Continue the task. Only call more tools if necessary, otherwise give "
      + "a short final summary of what you did.";
    const textFeedback = textResults.length > 0
      ? [{
          role: "user" as const,
          content:
            `Tool results:\n${textResults
              .map((result) =>
                `[Tool: ${result.tool}] ${result.success ? "Success" : "Error"}: ${result.result}`)
              .join("\n\n")}\n\n${continuationPrompt}`,
        }]
      : nativeResults.length === 0
        ? [{
            role: "user" as const,
            content: `Tool results:\n${toolFeedback}\n\n${continuationPrompt}`,
          }]
        : [];

    conversation = [
      ...conversation,
      ...nativeAssistant,
      ...nativeToolMessages,
      ...textFeedback,
    ];

    if (turnIndex === maxTurns - 1) hitTurnLimit = true;
  }

  return complete(false);
}
