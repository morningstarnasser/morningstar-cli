// ─── Parity Scenarios ────────────────────────────────────────────────────────
// Deterministic, data-defined behavioral scenarios for the agent loop — the
// TypeScript counterpart to claw-code's `mock_parity_scenarios.json` +
// `mock_parity_harness.rs`. Each scenario scripts the model (and, where needed,
// the tool executor), runs the REAL `runAgent`, and declares the behavior that
// must hold. The harness test iterates these; new scenarios lock new behavior.

import { runAgent, type AgentRunResult } from "../agent-runner.js";
import type { CLIConfig, Message } from "../types.js";
import {
  createMockProvider,
  scriptedToolExec,
  toolOk,
  toolFail,
  type MockTurn,
  type ScriptedToolStep,
  type CapturedRequest,
} from "./mock-provider.js";

export interface ParityExpectation {
  finalTextIncludes?: string;
  finalTextEquals?: string;
  turns?: number;
  toolCount?: number;
  requestCount?: number;
  aborted?: boolean;
  hitTurnLimit?: boolean;
}

export interface ParityScenario {
  name: string;
  description: string;
  turns: MockTurn[];
  toolSteps?: ScriptedToolStep[];
  maxTurns?: number;
  /** Start with an already-aborted signal (deterministic abort coverage). */
  preAborted?: boolean;
  expect: ParityExpectation;
}

export interface ParityRunResult {
  result: AgentRunResult;
  requests: CapturedRequest[];
}

const MOCK_CONFIG: CLIConfig = { model: "mock-parity" } as CLIConfig;
const SEED_MESSAGES: Message[] = [{ role: "user", content: "scenario seed" } as Message];

/** Execute one scenario against the real agent loop with mocked I/O. */
export async function runParityScenario(s: ParityScenario): Promise<ParityRunResult> {
  const provider = createMockProvider(s.turns);
  const toolExecFn = scriptedToolExec(s.toolSteps ?? []);
  const signal = s.preAborted ? AbortSignal.abort() : undefined;

  const result = await runAgent(SEED_MESSAGES, MOCK_CONFIG, "/tmp/parity", {
    streamFn: provider.streamFn,
    toolExecFn,
    maxTurns: s.maxTurns ?? 12,
    signal,
  });

  return { result, requests: provider.requests };
}

/** The canonical scenario set. Mirrors claw-code's harness milestones. */
export const PARITY_SCENARIOS: ParityScenario[] = [
  {
    name: "streaming_text",
    description: "Model streams prose and stops; no tools.",
    turns: [{ content: "Hello, this is a streamed answer." }],
    expect: { finalTextIncludes: "streamed answer", turns: 1, toolCount: 0, requestCount: 1 },
  },
  {
    name: "reasoning_then_text",
    description: "Reasoning delta precedes content; final answer is content only.",
    turns: [{ reasoning: "thinking about it", content: "Final answer." }],
    expect: { finalTextEquals: "Final answer.", turns: 1, toolCount: 0 },
  },
  {
    name: "read_file_roundtrip",
    description: "Turn 1 calls a tool, turn 2 answers from the result.",
    turns: [{ content: "<tool:read>file</tool>" }, { content: "The file contains FOO." }],
    toolSteps: [{ results: [toolOk("read", "FOO")], cleanResponse: "" }],
    expect: { finalTextIncludes: "FOO", turns: 2, toolCount: 1, requestCount: 2 },
  },
  {
    name: "multi_tool_turn_roundtrip",
    description: "A single turn produces multiple tool results.",
    turns: [{ content: "searching" }, { content: "Done searching." }],
    toolSteps: [{ results: [toolOk("grep", "3 hits"), toolOk("glob", "2 files")], cleanResponse: "" }],
    expect: { toolCount: 2, turns: 2, finalTextIncludes: "Done searching" },
  },
  {
    name: "write_file_allowed",
    description: "A write tool succeeds and the agent confirms.",
    turns: [{ content: "writing" }, { content: "Wrote the file." }],
    toolSteps: [{ results: [toolOk("write", "ok: 10 bytes")], cleanResponse: "" }],
    expect: { toolCount: 1, finalTextIncludes: "Wrote the file" },
  },
  {
    name: "write_file_denied",
    description: "A denied write surfaces as a failed tool result; the loop continues.",
    turns: [{ content: "writing" }, { content: "I could not write (permission denied)." }],
    toolSteps: [{ results: [toolFail("write", "permission denied")], cleanResponse: "" }],
    expect: { toolCount: 1, finalTextIncludes: "permission denied" },
  },
  {
    name: "prose_only_stops",
    description: "No tools in the first turn ends the loop immediately.",
    turns: [{ content: "Just talking, no tools." }],
    toolSteps: [],
    expect: { turns: 1, toolCount: 0 },
  },
  {
    name: "abort_preempts",
    description: "An already-aborted signal returns immediately, no turns run.",
    turns: [{ content: "should never be read" }],
    preAborted: true,
    expect: { aborted: true, turns: 0, requestCount: 0 },
  },
  {
    name: "turn_limit_reached",
    description: "Tools keep being called until maxTurns caps the loop.",
    turns: [{ content: "t1" }, { content: "t2" }, { content: "t3" }],
    toolSteps: [
      { results: [toolOk("bash", "1")], cleanResponse: "" },
      { results: [toolOk("bash", "2")], cleanResponse: "" },
      { results: [toolOk("bash", "3")], cleanResponse: "" },
    ],
    maxTurns: 2,
    expect: { turns: 2, hitTurnLimit: true, toolCount: 2 },
  },
];
