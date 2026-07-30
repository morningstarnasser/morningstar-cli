// ─── Deterministic Mock Provider ─────────────────────────────────────────────
// TypeScript analogue of claw-code's `mock-anthropic-service`: a scriptable,
// network-free model provider plus a scripted tool executor. Together they let
// the real agent loop (`runAgent`) and the Telegram gateway run fully
// deterministically — no network, no filesystem, no clock, no randomness — so a
// parity harness can lock behavior the way claw-code's captured /v1/messages
// requests do.
//
// This module is intentionally additive: it adds nothing to the live code paths
// and is imported only by tests (and, later, an optional `parity` command).

import type { Message, CLIConfig, ToolResult } from "../types.js";
import type { StreamToken } from "../providers.js";
import type { StreamFn, ToolExecFn } from "../agent-runner.js";

/** One captured model request, in order, for assertions and snapshots. */
export interface CapturedRequest {
  messages: Message[];
  config: CLIConfig;
  enableTools: boolean;
}

/** A single scripted model turn. */
export interface MockTurn {
  /** Emitted first as a reasoning token (optional). */
  reasoning?: string;
  /** Emitted as chunked content tokens (streaming-faithful). */
  content?: string;
  /** Fully explicit token sequence; overrides reasoning/content when set. */
  tokens?: StreamToken[];
}

export interface MockProvider {
  /** Captured requests, one per streamFn call, in order. */
  readonly requests: CapturedRequest[];
  /** Drop-in replacement for the real provider stream. */
  streamFn: StreamFn;
  /** Number of streamFn calls so far. */
  callCount(): number;
}

const CHUNK_SIZE = 24;

function* chunkContent(text: string): Generator<StreamToken> {
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    yield { type: "content", text: text.slice(i, i + CHUNK_SIZE) };
  }
}

/**
 * Build a deterministic provider from a script of turns. Each call to the
 * returned `streamFn` consumes the next turn. Calls beyond the script emit
 * nothing (which makes the agent loop end), so over-running is safe.
 */
export function createMockProvider(turns: MockTurn[]): MockProvider {
  const requests: CapturedRequest[] = [];
  let calls = 0;

  const streamFn: StreamFn = async function* (messages, config, signal, enableTools = true) {
    requests.push({ messages: [...messages], config, enableTools });
    const turn = turns[calls] ?? {};
    calls++;

    if (turn.tokens) {
      for (const token of turn.tokens) {
        if (signal?.aborted) return;
        yield token;
      }
      return;
    }

    if (turn.reasoning && !signal?.aborted) {
      yield { type: "reasoning", text: turn.reasoning };
    }
    if (turn.content) {
      for (const token of chunkContent(turn.content)) {
        if (signal?.aborted) return;
        yield token;
      }
    }
  };

  return { requests, streamFn, callCount: () => calls };
}

/** One scripted tool-execution step (replaces real parsing + side effects). */
export interface ScriptedToolStep {
  /** Tool results this turn produces (empty array ends the loop). */
  results: ToolResult[];
  /** The tool-stripped assistant text. Defaults to the raw response. */
  cleanResponse?: string;
}

/**
 * Build a deterministic tool executor from a script. Each agent turn consumes
 * the next step; steps beyond the script return no results (ending the loop).
 */
export function scriptedToolExec(steps: ScriptedToolStep[]): ToolExecFn {
  let i = 0;
  return async (response: string) => {
    const step = steps[i];
    i++;
    if (!step) return { results: [], cleanResponse: response };
    return { results: step.results, cleanResponse: step.cleanResponse ?? response };
  };
}

/** Convenience: a successful tool result with sensible defaults. */
export function toolOk(tool: string, result: string): ToolResult {
  return { tool, result, success: true };
}

/** Convenience: a failed tool result (e.g. permission denied). */
export function toolFail(tool: string, result: string): ToolResult {
  return { tool, result, success: false };
}
