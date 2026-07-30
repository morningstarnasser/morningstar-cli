export type VimMode = "normal" | "insert";
interface UseVimInputReturn {
    mode: VimMode;
    value: string;
    cursorPos: number;
    handleInput: (input: string, key: any) => {
        handled: boolean;
        submit?: string;
    };
    setValue: (v: string) => void;
    reset: () => void;
}
export declare function useVimInput(): UseVimInputReturn;
export {};
//# sourceMappingURL=useVimInput.d.ts.map