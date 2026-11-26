import React from "react";
import { DocumentLinks } from "../runtime/document-preview.js";
import type { WorkspaceData } from "../runtime/terminal-workspace.js";
export interface WorkspaceBridge {
    links: DocumentLinks;
    data?: WorkspaceData;
    scope?: string;
}
export declare const TerminalDocuments: React.Context<WorkspaceBridge | null>;
export declare function useWorkspaceData(data: WorkspaceData): void;
export declare function DocumentLinkText({ label, href }: {
    label: string;
    href: string;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=useTerminalDocuments.d.ts.map