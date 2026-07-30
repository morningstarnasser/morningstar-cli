interface SuggestionsProps {
    items: Array<{
        cmd: string;
        desc: string;
    }>;
    selectedIndex: number;
    visible: boolean;
}
export declare function Suggestions({ items, selectedIndex, visible }: SuggestionsProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=Suggestions.d.ts.map