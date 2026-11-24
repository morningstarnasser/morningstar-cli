import { executeQmd, parseVaultHits, type AsyncVaultExec, type VaultHit } from "../vault.js";

/** Short-lived automatic recall only. Manual vault searches/get always stay fresh. */
export function createRecallCache(
  exec: AsyncVaultExec = executeQmd,
  now: () => number = Date.now,
  ttlMs = 15000,
  maxEntries = 32,
): (args: string[], signal?: AbortSignal) => Promise<VaultHit[]> {
  const entries = new Map<string, { expires: number; hits: VaultHit[] }>();
  return async (args, signal) => {
    signal?.throwIfAborted();
    const key = JSON.stringify(args);
    const cached = entries.get(key);
    if (cached && cached.expires > now()) return cached.hits.map((hit) => ({ ...hit }));
    entries.delete(key);
    // Filter private records before storing anything; failed/cancelled reads are not cached.
    const hits = parseVaultHits(await exec(args, signal));
    signal?.throwIfAborted();
    if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
    entries.set(key, { expires: now() + ttlMs, hits });
    return hits.map((hit) => ({ ...hit }));
  };
}
export const recallVault = createRecallCache();
