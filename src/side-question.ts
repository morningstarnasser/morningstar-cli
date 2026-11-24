import { runAgent, type AgentRunOptions, type AgentRunResult } from "./agent-runner.js";
import type { CLIConfig, Message } from "./types.js";

/** An isolated answer: no tool execution, no changed session transcript or persistence. */
export function runSideQuestion(messages: readonly Message[], question: string, config: CLIConfig, cwd: string, options: AgentRunOptions = {}): Promise<AgentRunResult> {
  if (!question.trim()) throw new Error("Nebenfrage fehlt");
  return runAgent([
    ...messages.map((message) => ({ ...message })),
    { role: "user", content: `Nebenfrage: ${question}\nBeantworte nur diese Frage aus dem vorhandenen Kontext. Der laufende Auftrag bleibt unverändert. Es stehen keine Werkzeuge zur Verfügung.` },
  ], { ...config, jsonSchema: undefined, toolAllowlist: [], disallowedTools: ["*"], runtimeSettings: undefined }, cwd, { ...options, maxTurns: 1, enableTools: false, toolAllowlist: [] });
}
