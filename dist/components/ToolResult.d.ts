interface ToolResultProps {
    tool: string;
    result: string;
    success: boolean;
    diff?: {
        filePath: string;
        oldStr: string;
        newStr: string;
    };
}
export declare function ToolResult({ tool, result, success, diff }: ToolResultProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ToolResult.d.ts.map