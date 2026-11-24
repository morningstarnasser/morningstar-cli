import { type AsyncVaultExec, type VaultHit } from "../vault.js";
/** Short-lived automatic recall only. Manual vault searches/get always stay fresh. */
export declare function createRecallCache(exec?: AsyncVaultExec, now?: () => number, ttlMs?: number, maxEntries?: number): (args: string[], signal?: AbortSignal) => Promise<VaultHit[]>;
export declare const recallVault: (args: string[], signal?: AbortSignal) => Promise<VaultHit[]>;
//# sourceMappingURL=recall-cache.d.ts.map