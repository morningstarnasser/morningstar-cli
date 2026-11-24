import { runAgent } from "./agent-runner.js";
/** An isolated answer: no tool execution, no changed session transcript or persistence. */
export function runSideQuestion(messages, question, config, cwd, options = {}) {
    if (!question.trim())
        throw new Error("Nebenfrage fehlt");
    return runAgent([
        ...messages.map((message) => ({ ...message })),
        { role: "user", content: `Nebenfrage: ${question}\nBeantworte nur diese Frage aus dem vorhandenen Kontext. Der laufende Auftrag bleibt unverändert. Es stehen keine Werkzeuge zur Verfügung.` },
    ], { ...config, jsonSchema: undefined, toolAllowlist: [], disallowedTools: ["*"], runtimeSettings: undefined }, cwd, { ...options, maxTurns: 1, enableTools: false, toolAllowlist: [] });
}
//# sourceMappingURL=side-question.js.map