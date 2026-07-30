export interface InputRunContext {
  effectiveAgentId?: string;
  /**
   * Project/global custom-command content is a prompt template, never a second
   * line of trusted terminal input.
   */
  promptTemplate?: boolean;
}

export type LocalInputRoute = "prompt" | "slash" | "bang" | "cd";

export function classifyLocalInput(
  input: string,
  runContext: InputRunContext = {},
): LocalInputRoute {
  if (runContext.promptTemplate) return "prompt";
  if (input.startsWith("/")) return "slash";
  if (input.startsWith("!") && input.length > 1) return "bang";
  const trimmed = input.trim();
  if (trimmed === "cd" || /^cd\s+/.test(trimmed)) return "cd";
  return "prompt";
}
