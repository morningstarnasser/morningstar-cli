interface InputProps {
    onSubmit: (value: string) => void;
    activeAgent: string | null;
    planMode: boolean;
    thinkMode: boolean;
    isProcessing: boolean;
    suggestions: Array<{
        cmd: string;
        desc: string;
    }>;
    vimMode?: boolean;
    cwd?: string;
}
export declare function Input({ onSubmit, activeAgent, planMode, thinkMode, isProcessing, suggestions, vimMode, cwd }: InputProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Input.d.ts.map