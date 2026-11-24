// ─── Hallucinated "answer" tools ─────────────────────────────────────────────
// Small models routinely invent a tool for the one thing that needs no tool:
// replying. A 9B model asked "wer bist du?" emits `<tool:answer>Hi, ich bin…`
// instead of plain text. Treating that as an unknown-tool error costs a turn,
// feeds an error back, and the model retries the same invention until the turn
// budget runs out — the loop the user sees as "Morningstar spinnt".
//
// So: recognise the intent. A call to a tool that does not exist but is clearly
// named "reply to the user" IS the reply. We unwrap its payload as final text
// and end the run instead of burning turns on it.
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
/** Collapse naming variants: "final_answer", "Final-Answer", "finalAnswer". */
function normalizeToolName(name) {
    return name.toLowerCase().replace(/[\s_.\-]/g, "");
}
/** Names that mean "I am answering now", normalized. */
const FINAL_ANSWER_ALIASES = new Set([
    "answer",
    "answeruser",
    "assistant",
    "chat",
    "complete",
    "conclude",
    "done",
    "echo",
    "final",
    "finalanswer",
    "finalmessage",
    "finalresponse",
    "finish",
    "message",
    "output",
    "print",
    "reply",
    "replytouser",
    "respond",
    "respondtouser",
    "response",
    "result",
    "say",
    "speak",
    "summary",
    "text",
    "userresponse",
]);
/** Real tool names, so a genuine tool is never swallowed by the heuristic. */
const KNOWN_TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((definition) => normalizeToolName(definition.function.name)));
/**
 * True when `name` is not a real tool but is clearly the model's way of saying
 * "here is my reply".
 */
export function isFinalAnswerTool(name) {
    const normalized = normalizeToolName(name);
    if (KNOWN_TOOL_NAMES.has(normalized))
        return false;
    return FINAL_ANSWER_ALIASES.has(normalized);
}
/**
 * Feedback for a tool name that is neither real nor an answer alias.
 *
 * The list is derived from the actual registry instead of being hardcoded, so
 * it can never drift out of date, and it states the escape hatch explicitly:
 * plain text needs no tool at all.
 */
export function unknownToolMessage(name) {
    const available = TOOL_DEFINITIONS
        .map((definition) => definition.function.name)
        .join(", ");
    return `Unbekanntes Tool: ${name}. Verfuegbar: ${available}. `
        + "Wenn du dem Nutzer nur antworten willst, schreibe einfach Text ohne Tool-Aufruf.";
}
/** Argument keys that carry the reply, most specific first. */
const TEXT_KEYS = [
    "raw",
    "text",
    "answer",
    "message",
    "content",
    "response",
    "reply",
    "summary",
    "output",
    "result",
    "value",
];
/**
 * Pull the reply text out of a hallucinated answer call.
 *
 * The text protocol delivers `{ raw: "…" }`; native function calling delivers
 * whatever key the model invented. Nested JSON (`{"raw":"{\"text\":\"hi\"}"}`)
 * is unwrapped one level, which is where models usually stop nesting.
 */
export function extractFinalAnswerText(args) {
    for (const key of TEXT_KEYS) {
        const value = args[key];
        if (typeof value !== "string")
            continue;
        const trimmed = value.trim();
        if (!trimmed)
            continue;
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                const parsed = JSON.parse(trimmed);
                const inner = extractFinalAnswerText(parsed);
                if (inner)
                    return inner;
            }
            catch {
                // Not JSON after all — fall through and use the raw string.
            }
        }
        return trimmed;
    }
    // No known key: accept a lone string value, e.g. { foo: "the reply" }.
    const values = Object.values(args).filter((value) => typeof value === "string" && value.trim().length > 0);
    return values.length === 1 ? values[0].trim() : "";
}
//# sourceMappingURL=final-answer.js.map