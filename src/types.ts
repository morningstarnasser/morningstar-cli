export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolResult {
  tool: string;
  result: string;
  success: boolean;
  diff?: { filePath: string; oldStr: string; newStr: string };
  // Claude Code-style metadata
  filePath?: string;
  linesChanged?: number;
  command?: string;
  startLineNumber?: number;
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
  maxTurns?: number;
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
