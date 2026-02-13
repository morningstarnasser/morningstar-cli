// ─── Extended Thinking ───────────────────────────────────
// Effort-level management and provider-specific thinking parameters

export type EffortLevel = "low" | "medium" | "high" | "ultra";

export interface ThinkingConfig {
  effortLevel: EffortLevel;
  enabled: boolean;
}

let thinkingConfig: ThinkingConfig = {
  effortLevel: "medium",
  enabled: false,
};

/**
 * Get current thinking config.
 */
export function getThinkingConfig(): ThinkingConfig {
  return { ...thinkingConfig };
}

/**
 * Set effort level.
 */
export function setEffortLevel(level: EffortLevel): void {
  thinkingConfig.effortLevel = level;
  thinkingConfig.enabled = true;
}

/**
 * Toggle extended thinking on/off.
 */
export function toggleThinking(): boolean {
  thinkingConfig.enabled = !thinkingConfig.enabled;
  return thinkingConfig.enabled;
}

/**
 * Disable extended thinking.
 */
export function disableThinking(): void {
  thinkingConfig.enabled = false;
}

/**
 * Get provider-specific thinking parameters.
 */
export function getThinkingParams(provider: string, model: string): Record<string, unknown> {
  if (!thinkingConfig.enabled) return {};

  const level = thinkingConfig.effortLevel;

  // Anthropic Claude models
  if (provider === "anthropic" || model.startsWith("claude")) {
    const budgetMap: Record<EffortLevel, number> = {
      low: 1024,
      medium: 4096,
      high: 16384,
      ultra: 32768,
    };
    return {
      thinking: {
        type: "enabled",
        budget_tokens: budgetMap[level],
      },
    };
  }

  // OpenAI reasoning models (o1, o3)
  if (model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4")) {
    const effortMap: Record<EffortLevel, string> = {
      low: "low",
      medium: "medium",
      high: "high",
      ultra: "high",
    };
    return {
      reasoning_effort: effortMap[level],
    };
  }

  // DeepSeek reasoning
  if (model.includes("reasoner") || model.includes("deepseek-r1")) {
    // DeepSeek handles reasoning natively, but we can adjust temperature
    const tempMap: Record<EffortLevel, number> = {
      low: 0.3,
      medium: 0.6,
      high: 0.8,
      ultra: 1.0,
    };
    return {
      temperature: tempMap[level],
    };
  }

  // Google Gemini
  if (provider === "google" || model.startsWith("gemini")) {
    // Gemini 2.0 thinking mode
    if (model.includes("thinking") || level === "ultra") {
      return {
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: level === "ultra" ? 24576 : level === "high" ? 8192 : 4096,
          },
        },
      };
    }
  }

  // Generic: add thinking instruction via system prompt prefix
  return {};
}

/**
 * Get a thinking instruction prefix for models without native thinking support.
 */
export function getThinkingPromptPrefix(): string {
  if (!thinkingConfig.enabled) return "";

  const level = thinkingConfig.effortLevel;

  switch (level) {
    case "low":
      return "Denke kurz nach bevor du antwortest.\n\n";
    case "medium":
      return "Denke Schritt fuer Schritt nach. Nutze <think>...</think> Tags fuer deinen Denkprozess.\n\n";
    case "high":
      return "Denke sehr gruendlich und systematisch nach. Analysiere alle Aspekte. Nutze <think>...</think> Tags fuer deinen ausfuehrlichen Denkprozess.\n\n";
    case "ultra":
      return "ULTRATHINK: Denke extrem tiefgruendig nach. Analysiere JEDEN Aspekt, betrachte alle Edge Cases, denke ueber Konsequenzen nach. Nutze <think>...</think> Tags fuer deinen umfassenden Denkprozess. Qualitaet ist wichtiger als Geschwindigkeit.\n\n";
    default:
      return "";
  }
}

/**
 * Get thinking status display.
 */
export function getThinkingStatus(): string {
  const lines = [
    "Extended Thinking:",
    `  Aktiviert:  ${thinkingConfig.enabled ? "Ja" : "Nein"}`,
    `  Effort:     ${thinkingConfig.effortLevel}`,
    "",
    "  Verfuegbare Level:",
    "    low    — Kurzes Nachdenken",
    "    medium — Schritt fuer Schritt",
    "    high   — Gruendliche Analyse",
    "    ultra  — Maximale Denktiefe",
    "",
    "  Befehle:",
    "    /effort <level>  — Effort-Level setzen",
    "    /ultrathink      — Ultra-Modus an/aus",
    "    /think            — Think-Modus an/aus",
  ];

  return lines.join("\n");
}
