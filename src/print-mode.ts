import { randomUUID } from "node:crypto";
import { readPrintInput } from "./print-input.js";
import { saveConversation } from "./history.js";
import { runRuntimeHooks } from "./runtime-hooks.js";
import type { Readable } from "node:stream";
import type { AgentRunOptions } from "./agent-runner.js";
import {
  runAgent,
  type AgentLifecycleEvent,
  type AgentRunResult,
  type ToolInvocation,
} from "./agent-runner.js";
import type { Message, CLIConfig } from "./types.js";
import type { PolicyVerdict } from "./policy-engine.js";
import type { UsageData } from "./providers.js";

interface PrintResult {
  result: string;
  model: string;
  cost: { inputTokens: number; outputTokens: number };
}

export type PrintStreamEvent =
  | Extract<AgentLifecycleEvent, { type: "backend_activity" }>
  | import("./swarm-tool.js").SwarmEvent
  | { type: "turn_start"; turn: number }
  | { type: "content"; turn: number; text: string }
  | { type: "reasoning"; turn: number; text: string }
  | { type: "tool_requested"; turn: number; invocation: ToolInvocation }
  | {
      type: "approval_required";
      turn: number;
      invocation: ToolInvocation;
      verdict: PolicyVerdict;
    }
  | {
      type: "approval_decision";
      turn: number;
      invocation: ToolInvocation;
      decision: "allow" | "deny";
      source: "policy" | "user" | "missing_callback";
      reason: string;
    }
  | {
      type: "tool";
      turn: number;
      invocation: ToolInvocation;
      tool: string;
      result: string;
      success: boolean;
    }
  | { type: "usage"; turn: number; usage: UsageData }
  | { type: "turn_end"; turn: number; text: string; toolCount: number }
  | {
      type: "completion";
      result: string;
      turns: number;
      toolCount: number;
      usage: UsageData;
      aborted: boolean;
      hitTurnLimit: boolean;
      loopDetected: boolean;
      structured_output?: unknown;
      structured_output_error?: string;
      tool_protocol_error?: string;
    };

/** Convert internal lifecycle events to the stable NDJSON print contract. */
export function toPrintStreamEvent(
  event: AgentLifecycleEvent,
): PrintStreamEvent {
  switch (event.type) {
    case "backend_activity":
    case "swarm_start":
    case "swarm_progress":
    case "swarm_activity":
    case "swarm_end":
      return event;
    case "turn_start":
      return event;
    case "content_delta":
      return { type: "content", turn: event.turn, text: event.delta };
    case "reasoning_delta":
      return { type: "reasoning", turn: event.turn, text: event.delta };
    case "tool_requested":
      return event;
    case "approval_required":
      return {
        type: "approval_required",
        turn: event.request.turn,
        invocation: event.request.invocation,
        verdict: event.request.verdict,
      };
    case "approval_decision":
      return {
        type: "approval_decision",
        turn: event.decision.turn,
        invocation: event.decision.invocation,
        decision: event.decision.decision,
        source: event.decision.source,
        reason: event.decision.reason,
      };
    case "tool_result":
      return {
        type: "tool",
        turn: event.turn,
        invocation: event.invocation,
        tool: event.result.tool,
        result: event.result.result,
        success: event.result.success,
      };
    case "usage":
      return event;
    case "turn_end":
      return {
        type: "turn_end",
        turn: event.turn,
        text: event.text,
        toolCount: event.tools.length,
      };
    case "completion":
      return completionEvent(event.result);
  }
}

function completionEvent(result: AgentRunResult): PrintStreamEvent {
  return {
    type: "completion",
    result: result.finalText,
    turns: result.turns,
    toolCount: result.toolCalls.length,
    usage: result.usage,
    aborted: result.aborted,
    hitTurnLimit: result.hitTurnLimit,
    loopDetected: result.loopDetected,
    ...(result.structuredOutput !== undefined ? { structured_output: result.structuredOutput } : {}),
    ...(result.structuredOutputError ? { structured_output_error: result.structuredOutputError } : {}),
    ...(result.toolProtocolError ? { tool_protocol_error: result.toolProtocolError } : {}),
  };
}

export function printExitCode(result: AgentRunResult): number {
  if (result.aborted) return 130;
  return result.toolProtocolError || result.structuredOutputError || result.hitTurnLimit || result.loopDetected || result.budgetExceeded || result.toolCalls.some((tool) => !tool.success) ? 1 : 0;
}

export interface PrintIO {
  input?: Readable;
  write?: (text: string) => void;
  runnerOptions?: AgentRunOptions;
}

export async function runPrintMode(
  prompt: string,
  systemPrompt: string,
  config: CLIConfig,
  cwd: string,
  resumedMessages: Message[] = [],
  io: PrintIO = {},
): Promise<number> {
  const format = config.outputFormat || "text";
  const write = io.write ?? ((text: string) => { process.stdout.write(text); });
  const input = io.input ?? (!process.stdin.isTTY ? process.stdin : undefined);
  const sessionId = config.sessionId ?? randomUUID();
  let messages: Message[] = [{ role: "system", content: systemPrompt }, ...resumedMessages.filter((m) => m.role !== "system")];
  let exitCode = 0;
  let processed = 0;
  let spent = 0;
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  const run = async (content: string) => {
    if (!content.trim()) return;
    processed++;
    if (processed > 100) throw new Error("Maximum 100 input messages per print session");
    messages.push({ role: "user", content });
    const result = await runAgent(messages, { ...config, sessionId }, cwd, {
      ...io.runnerOptions,
      signal: controller.signal,
      initialCostUsd: spent,
      maxTurns: config.maxTurns,
      enableTools: config.toolAllowlist?.length === 0 ? false : io.runnerOptions?.enableTools,
      onEvent: format === "stream-json" ? (event) => write(`${JSON.stringify(toPrintStreamEvent(event))}\n`) : undefined,
    });
    spent += result.costUsd ?? 0;
    messages = result.messages ?? [...messages, { role: "assistant", content: result.finalText }];
    exitCode = Math.max(exitCode, printExitCode(result));
    if (!config.noSessionPersistence) saveConversation(config.sessionName || content.slice(0, 80), messages, config.model, cwd, sessionId);
    if (format === "json") write(`${JSON.stringify({ result: result.finalText, session_id: sessionId, model: config.model, is_error: printExitCode(result) !== 0, turns: result.turns, cost: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }, cost_usd: result.costUsd, budget_exceeded: result.budgetExceeded, structured_output: result.structuredOutput, structured_output_error: result.structuredOutputError })}\n`);
    else if (format === "text") write(`${result.finalText}\n`);
  };
  try {
    const start = await runRuntimeHooks(config.runtimeSettings?.trustedHooks, "SessionStart", { cwd, session_id: sessionId, reason: resumedMessages.length ? "resume" : "startup" }, controller.signal);
    if (!start.allowed) throw new Error(start.messages.join("\n"));
    if (start.messages.length) messages.push({ role: "user", content: `Session hook context:\n${start.messages.join("\n")}` });
    if (config.inputFormat === "stream-json") {
      if (format !== "stream-json") throw new Error("stream-json input requires stream-json output");
      if (prompt) await run(prompt);
      if (input) for await (const content of readPrintInput(input, "stream-json")) { await run(content); if (exitCode) break; }
    } else {
      let content = "";
      if (input) for await (const part of readPrintInput(input, "text")) content += part;
      await run([content, prompt].filter(Boolean).join("\n\n"));
    }
    if (!processed) throw new Error("No prompt or input supplied");
    const end = await runRuntimeHooks(config.runtimeSettings?.trustedHooks, "SessionEnd", { cwd, session_id: sessionId, reason: exitCode ? "error" : "complete" }, controller.signal);
    if (!end.allowed) exitCode ||= 1;
    if (!io.write) process.exitCode = exitCode;
    return exitCode;
  } finally {
    process.removeListener("SIGINT", interrupt);
  }
}
