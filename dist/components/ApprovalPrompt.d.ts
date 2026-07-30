import type { Risk } from "../policy-engine.js";
export interface ApprovalPromptProps {
    tool: string;
    target: string;
    reason: string;
    risk: Risk;
    onDecision: (approved: boolean) => void;
    isActive?: boolean;
}
export declare function paginateApprovalTarget(target: string, pageSize?: number): string[];
export declare function ApprovalPrompt({ tool, target, reason, risk, onDecision, isActive, }: ApprovalPromptProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ApprovalPrompt.d.ts.map