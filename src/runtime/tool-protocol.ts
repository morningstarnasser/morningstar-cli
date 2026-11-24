/** Detect a standalone broken invocation, never an example embedded in prose/code. */
export function isMalformedToolAttempt(text: string): boolean {
  const value = text.trim();
  return value.length <= 200_000 && /^(?:<)?tool:[a-zA-Z0-9_]+(?:>|\s|\{)/.test(value)
    && !value.includes("</tool") && !value.includes("```");
}
