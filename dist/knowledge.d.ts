import { type AsyncVaultExec } from "./vault.js";
import type { Message } from "./types.js";
export interface KnowledgeOptions {
    cwd: string;
    query: string;
    signal?: AbortSignal;
    allowed: (tool: "skill" | "vault", command: string) => boolean | Promise<boolean>;
    exec?: AsyncVaultExec;
    filterResult?: (tool: "skill" | "vault", command: string, result: string) => Promise<string>;
}
/** Metadata and short public excerpts only. Full procedures stay lazy-loaded. */
export declare function prepareKnowledge(options: KnowledgeOptions): Promise<Message[]>;
//# sourceMappingURL=knowledge.d.ts.map