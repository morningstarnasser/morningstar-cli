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
    };

/** Convert internal lifecycle events to the stable NDJSON print contract. */
export function toPrintStreamEvent(
  event: AgentLifecycleEvent,
): PrintStreamEvent {
  switch (event.type) {
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
  };
}

export async function runPrintMode(
  prompt: string,
  systemPrompt: string,
  config: CLIConfig,
  cwd: string,
): Promise<void> {
  const format = config.outputFormat || "text";
  const maxTurns = config.maxTurns ?? 5;

  // Read stdin if available (pipe-friendly)
  let stdinContent = "";
  if (!process.stdin.isTTY) {
    stdinContent = await readStdin();
  }

  const userContent = stdinContent
    ? `${stdinContent}\n\n${prompt}`
    : prompt;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const result = await runAgent(messages, config, cwd, {
    maxTurns,
    onEvent: format === "stream-json"
      ? (event) => {
          process.stdout.write(`${JSON.stringify(toPrintStreamEvent(event))}\n`);
        }
      : undefined,
  });

  if (format === "json") {
    const output: PrintResult = {
      result: result.finalText,
      model: config.model,
      cost: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    };
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else if (format === "text") {
    process.stdout.write(`${result.finalText}\n`);
  }

  process.exit(0);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    // Timeout after 100ms of no data for non-pipe scenarios
    setTimeout(() => resolve(data), 100);
  });
}
