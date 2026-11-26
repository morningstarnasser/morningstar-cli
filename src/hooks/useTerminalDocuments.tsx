import { displayText } from "../runtime/work-log.js";
import { existsSync } from "node:fs";
import React, { createContext, useContext, useLayoutEffect } from "react";
import { Text, useStdin } from "ink";
import { resolve } from "node:path";
import { useTheme } from "./useTheme.js";
import { DocumentLinks, localDocumentHref } from "../runtime/document-preview.js";
import type { WorkspaceData } from "../runtime/terminal-workspace.js";

export interface WorkspaceBridge { links: DocumentLinks; data?: WorkspaceData; scope?: string }
export const TerminalDocuments = createContext<WorkspaceBridge | null>(null);

export function useWorkspaceData(data: WorkspaceData) {
  const bridge = useContext(TerminalDocuments), { internal_eventEmitter } = useStdin();
  if (bridge) {
    if (bridge.scope !== data.scope) {
      bridge.links.clear(); bridge.scope = data.scope;
      for (const file of ["README.md", "AGENTS.md", "MORNINGSTAR.md"]) {
        const path = resolve(data.cwd, file);
        if (existsSync(path)) bridge.links.register(file === "README.md" ? "Projektanleitung" : file, path);
      }
    }
    bridge.data = data;
  }
  useLayoutEffect(() => { internal_eventEmitter.emit("morningstar:workspace-update"); });
}

export function DocumentLinkText({ label, href }: { label: string; href: string }) {
  const bridge = useContext(TerminalDocuments), theme = useTheme();
  let target = href;
  if (localDocumentHref(href) && !/^(?:[a-z][\w+.-]*:|[\\/]|~[\\/])/i.test(href)) target = resolve(bridge?.data?.cwd || process.cwd(), href);
  const link = bridge?.links.register(label, target);
  return <Text color={theme.info} underline>{link?.marker ?? `${displayText(label)}${href !== label ? ` (${displayText(href)})` : ""}`}</Text>;
}
