// ─── Transparent Model Fallback Chain ────────────────────────────────────────
// Hermes never silently downgrades — it prefixes a ⚠️ FALLBACK marker. We do the
// same: try the primary model, and on a provider error (EOL/410, 429, timeout,
// missing key) fall through to the next model in the chain, emitting one visible
// marker token so the user always knows which brain answered.

import type { Message, CLIConfig } from "./types.js";
import type { StreamToken } from "./providers.js";
import type { StreamFn } from "./agent-runner.js";

export const FALLBACK_MARKER = "⚠️ FALLBACK";

/**
 * Build the ordered model chain: primary first, then any fallbacks, deduped, and
 * dropping models whose provider has no key. Pure + testable.
 */
export function pickModelChain(
  primary: string,
  fallbacks: string[],
  hasKey: (model: string) => boolean,
): string[] {
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const m of [primary, ...fallbacks]) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    if (hasKey(m)) chain.push(m);
  }
  // Always keep the primary even if it has no key, so the user gets a clear
  // error rather than a silent skip — unless a working fallback exists.
  if (chain.length === 0 && primary) chain.push(primary);
  return chain;
}

/**
 * A StreamFn that walks a model chain. For each model it rebuilds the config via
 * `makeConfig(model)` and delegates to `baseStream`. If a model throws before
 * producing any content, it moves to the next and emits a one-time fallback
 * marker. `onFallback` is called with each (failed, next) pair for logging.
 */
export function createResilientStream(
  chain: string[],
  makeConfig: (model: string) => CLIConfig,
  baseStream: StreamFn,
  onFallback?: (failed: string, next: string, error: string) => void,
): StreamFn {
  return async function* (messages: Message[], _config: CLIConfig, signal?: AbortSignal): AsyncGenerator<StreamToken> {
    let lastError: Error | null = null;

    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      const config = makeConfig(model);
      let produced = false;
      try {
        for await (const token of baseStream(messages, config, signal)) {
          produced = true;
          yield token;
        }
        return; // success
      } catch (e) {
        lastError = e as Error;
        if (produced || signal?.aborted) throw e; // mid-stream failure: don't double-answer
        const next = chain[i + 1];
        if (next) {
          onFallback?.(model, next, lastError.message);
          yield { type: "content", text: `\n${FALLBACK_MARKER}: ${model} → ${next}\n` };
        }
      }
    }
    throw lastError ?? new Error("Kein Modell in der Fallback-Kette verfügbar.");
  };
}
