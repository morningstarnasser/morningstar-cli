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
}
export declare function Input({ onSubmit, activeAgent, planMode, thinkMode, isProcessing, suggestions }: InputProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=Input.d.ts.map