import type { ToolResult as ToolResultType } from "../types.js";
interface ToolGroupProps {
    results: ToolResultType[];
    duration: number;
    tokenCount: number;
    expanded: boolean;
    label?: string;
    toolUseCount: number;
}
export declare function ToolGroup({ results, duration, tokenCount, expanded, label, toolUseCount }: ToolGroupProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ToolGroup.d.ts.map