// Fast model mapping: full model → lighter/faster variant
const FAST_MAP: Record<string, string> = {
  "deepseek-reasoner": "deepseek-chat",
  "deepseek-chat": "deepseek-reasoner",
  "o3": "o3-mini",
  "o3-mini": "o3",
  "gpt-4.1": "gpt-4.1-mini",
  "gpt-4.1-mini": "gpt-4.1",
  "gpt-4o": "gpt-4o-mini",
  "gpt-4o-mini": "gpt-4o",
  "claude-sonnet-4-20250514": "claude-haiku-3-5-20241022",
  "claude-haiku-3-5-20241022": "claude-sonnet-4-20250514",
  "claude-opus-4-20250514": "claude-sonnet-4-20250514",
  "gemini-2.0-pro": "gemini-2.0-flash",
  "gemini-2.0-flash": "gemini-2.0-pro",
  "gemini-2.5-pro": "gemini-2.5-flash",
  "gemini-2.5-flash": "gemini-2.5-pro",
  "llama-3.3-70b-versatile": "llama-3.1-8b-instant",
  "llama-3.1-8b-instant": "llama-3.3-70b-versatile",
};

export function getFastModel(model: string): string {
  return FAST_MAP[model] || model;
}

export function getDefaultModel(model: string): string {
  // Reverse lookup: if current is fast, get the default
  return FAST_MAP[model] || model;
}
