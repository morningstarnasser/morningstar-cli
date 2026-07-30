import { type AgentRunResult } from "../agent-runner.js";
import { type MockTurn, type ScriptedToolStep, type CapturedRequest } from "./mock-provider.js";
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
/** Execute one scenario against the real agent loop with mocked I/O. */
export declare function runParityScenario(s: ParityScenario): Promise<ParityRunResult>;
/** The canonical scenario set. Mirrors claw-code's harness milestones. */
export declare const PARITY_SCENARIOS: ParityScenario[];
//# sourceMappingURL=parity-scenarios.d.ts.map