import type { SessionController } from "../session-controller.js";
export declare function SessionPicker({ sessions, onSelect, onClose }: {
    sessions: ReturnType<SessionController["list"]>;
    onSelect: (id: string) => void;
    onClose: () => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SessionPicker.d.ts.map