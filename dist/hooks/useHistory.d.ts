export declare function useCommandHistory(): {
    history: string[];
    addToHistory: (cmd: string) => void;
    navigateUp: (currentInput: string) => string | null;
    navigateDown: () => string | null;
    resetNavigation: () => void;
};
//# sourceMappingURL=useHistory.d.ts.map