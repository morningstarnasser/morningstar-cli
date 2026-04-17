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
}
export declare function StatusLine({ cwd, model, provider, activeAgent, activeSkill, vimMode, fastMode, debugMode, remainingBudget, }: StatusLineProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=StatusLine.d.ts.map