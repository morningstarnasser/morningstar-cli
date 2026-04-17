interface StatusLineProps {
    cwd: string;
    model: string;
    provider: string;
    activeAgent: string | null;
    activeSkill: string | null;
    vimMode: boolean;
    fastMode: boolean;
    debugMode: boolean;
    remainingBudget?: number;
    contextTokens?: number;
    contextMax?: number;
    tps?: number;
}
export declare function StatusLine({ cwd, model, provider, activeAgent, activeSkill, vimMode, fastMode, debugMode, remainingBudget, contextTokens, contextMax, tps, }: StatusLineProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=StatusLine.d.ts.map