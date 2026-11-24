export interface MessageToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ImageAttachment {
  id: number;
  path: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  sha256: string;
}

export interface Message {
  /** Internal context classification; never a provider role. */
  contextKind?: "knowledge" | "summary" | "tool-feedback";
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: ImageAttachment[];
  /** Provider-neutral assistant tool calls for a native continuation turn. */
  toolCalls?: MessageToolCall[];
  /** Provider call id referenced by a tool-result message. */
  toolCallId?: string;
  /** Tool/function name (required by Gemini, useful for diagnostics). */
  toolName?: string;
  isError?: boolean;
}

export interface ToolResult {
  tool: string;
  result: string;
  success: boolean;
  diff?: { filePath: string; oldStr: string; newStr: string };
  taskId?: string;
  // Claude Code-style metadata
  filePath?: string;
  linesChanged?: number;
  command?: string;
  startLineNumber?: number;
  exitCode?: number | null;
  exitSignal?: string | null;
}

export interface ProjectContext {
  cwd: string;
  projectName: string;
  language: string | null;
  framework: string | null;
  files: string[];
  gitBranch: string | null;
  hasGit: boolean;
}

export interface CLIConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
  provider?: string;
  // Claude Code-compatible flags:
  outputFormat?: "text" | "json" | "stream-json";
  verbose?: boolean;
  quiet?: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
  askTools?: string[];
  toolAllowlist?: string[];
  /** Disable autonomous delegation for nested workers or constrained clients. */
  enableSwarm?: boolean;
  /** This invocation was started with --yolo; do not persist it as a default. */
  yolo?: boolean;
  disableBypassPermissions?: boolean;
  runtimeSettings?: import("./settings.js").MorningstarSettings;
  inputFormat?: "text" | "stream-json";
  noSessionPersistence?: boolean;
  sessionName?: string;
  /** 0 or omission: unlimited. */
  maxTurns?: number;
  /** Normal frontends enable local Superbrain recall; embedders opt in. */
  autoKnowledge?: boolean;
  /** Request character budget including retained system/task text. */
  contextChars?: number;
  fallbackModel?: string;
  fast?: boolean;
  additionalDirs?: string[];
  systemPromptOverride?: string;
  // Permission flags:
  dangerouslySkipPermissions?: boolean;
  permissionMode?: string;
  // Enhanced CLI flags:
  appendSystemPrompt?: string;
  preSelectedAgents?: string[];
  jsonSchema?: string;
  debug?: boolean;
  maxBudgetUsd?: number;
  forkSession?: string;
  sessionId?: string;
  sandbox?: boolean;
}
