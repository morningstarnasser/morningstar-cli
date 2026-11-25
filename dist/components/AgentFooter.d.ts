import type { AgentBranch } from "./AgentTree.js";
export declare function activeAgentBranches(branches: AgentBranch[]): AgentBranch[];
/** Only live workers occupy the pinned footer; completed reports stay in history. */
export declare function AgentFooter({ branches, selected, onSelect }: {
    branches: AgentBranch[];
    selected: string | null;
    onSelect: (id: string | null) => void;
}): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=AgentFooter.d.ts.map