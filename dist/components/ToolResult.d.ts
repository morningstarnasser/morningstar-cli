interface ToolResultProps {
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
    startLineNumber?: number;
}
export declare function ToolResult({ tool, result, success, diff, filePath, linesChanged, command, startLineNumber }: ToolResultProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ToolResult.d.ts.map