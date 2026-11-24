import type { ImageAttachment } from "../types.js";
import type { InputRunContext } from "../input-routing.js";
interface InputProps {
    permissionMode?: import("../permissions.js").PermissionMode;
    modeLocked?: boolean;
    onCycleMode?: (reverse: boolean) => void;
    onSubmit: (value: string, context?: InputRunContext) => void;
    seedImages?: ImageAttachment[];
    onSendNow?: () => void;
    initialValue?: string;
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
    isActive?: boolean;
    onSelectionChange?: (text: string) => void;
    onCancel?: () => void;
}
export declare function Input({ onSubmit, activeAgent, planMode, permissionMode, modeLocked, onCycleMode, thinkMode, isProcessing, suggestions, vimMode, cwd, isActive, onSelectionChange, onCancel, onSendNow, initialValue, seedImages }: InputProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Input.d.ts.map