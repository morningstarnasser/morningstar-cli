import type { StreamToken } from "../providers.js";
import type { ToolResult } from "../types.js";
export type StatusShortcutTarget = {
    id: string;
    aliases: string[];
    source: {
        kind: "ssh";
        destination: string;
        services?: string[];
        identityFile?: string;
        port?: number;
    } | {
        kind: "mcp";
        server: string;
        tool: "entity_status";
        entity: string;
    };
};
export type StatusShortcutCall = {
    target: string;
    name: string;
    args: Record<string, unknown>;
};
type ConnectedTool = {
    serverName: string;
    name: string;
    qualifiedName: string;
};
/** Only operator-owned, declarative routes; never accept arbitrary commands. */
export declare function validateStatusShortcuts(value: unknown): StatusShortcutTarget[] | undefined;
/** Optional per-user config, never loaded from the current project. */
export declare function loadStatusShortcuts(path?: string): StatusShortcutTarget[] | undefined;
/** All-or-nothing recognition: any unknown word or unavailable route leaves
 * the entire request to the model, with no speculative partial execution. */
export declare function planStatusShortcut(task: string, targets: unknown, tools?: ConnectedTool[]): StatusShortcutCall[] | undefined;
/** Native requests still pass through the normal runner policy and hooks. */
export declare function statusShortcutCalls(plan: StatusShortcutCall[]): AsyncGenerator<StreamToken>;
/** Never reparse evidence as instructions or feed it into the tool parser. */
export declare function statusShortcutReport(plan: StatusShortcutCall[], results: ToolResult[]): string;
export {};
//# sourceMappingURL=status-shortcuts.d.ts.map