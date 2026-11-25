import type { ToolResult } from "../types.js";
/** Learn only explicit durable user preferences, never prose from tools or assistants. */
export declare function durableCorrection(prompt: string): string | undefined;
/** Small allowlist of repeatable verification commands; no arbitrary shell is learned. */
export declare function verificationCommand(command: string): string | undefined;
export declare class ActiveLearning {
    readonly projectId: string;
    private checks;
    private correction;
    constructor(cwd: string, prompt: string);
    context(): string;
    observe(result: ToolResult, command?: string): void;
    finish(completed: boolean): string[];
}
export declare function isLearnedContext(content: string): boolean;
//# sourceMappingURL=active-learning.d.ts.map