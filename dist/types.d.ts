export interface Message {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface ToolResult {
    tool: string;
    result: string;
    success: boolean;
    diff?: {
        filePath: string;
        oldStr: string;
        newStr: string;
    };
    filePath?: string;
    linesChanged?: number;
    command?: string;
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
}
//# sourceMappingURL=types.d.ts.map