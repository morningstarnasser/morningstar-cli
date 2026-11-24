/**
 * True when `name` is not a real tool but is clearly the model's way of saying
 * "here is my reply".
 */
export declare function isFinalAnswerTool(name: string): boolean;
/**
 * Feedback for a tool name that is neither real nor an answer alias.
 *
 * The list is derived from the actual registry instead of being hardcoded, so
 * it can never drift out of date, and it states the escape hatch explicitly:
 * plain text needs no tool at all.
 */
export declare function unknownToolMessage(name: string): string;
/**
 * Pull the reply text out of a hallucinated answer call.
 *
 * The text protocol delivers `{ raw: "…" }`; native function calling delivers
 * whatever key the model invented. Nested JSON (`{"raw":"{\"text\":\"hi\"}"}`)
 * is unwrapped one level, which is where models usually stop nesting.
 */
export declare function extractFinalAnswerText(args: Record<string, unknown>): string;
//# sourceMappingURL=final-answer.d.ts.map