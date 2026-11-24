import type { Message } from "../types.js";
import { type RewindAction } from "../runtime/rewind.js";
export declare function RewindPicker({ messages, busy, onChoose, onClose }: {
    messages: Message[];
    busy: boolean;
    onChoose: (index: number, action: RewindAction) => void;
    onClose: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=RewindPicker.d.ts.map