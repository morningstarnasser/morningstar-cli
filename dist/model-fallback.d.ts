import type { CLIConfig } from "./types.js";
import type { StreamFn } from "./agent-runner.js";
export declare const FALLBACK_MARKER = "\u26A0\uFE0F FALLBACK";
/**
 * Build the ordered model chain: primary first, then any fallbacks, deduped, and
 * dropping models whose provider has no key. Pure + testable.
 */
export declare function pickModelChain(primary: string, fallbacks: string[], hasKey: (model: string) => boolean): string[];
/**
 * A StreamFn that walks a model chain. For each model it rebuilds the config via
 * `makeConfig(model)` and delegates to `baseStream`. If a model throws before
 * producing any content, it moves to the next and emits a one-time fallback
 * marker. `onFallback` is called with each (failed, next) pair for logging.
 */
export declare function createResilientStream(chain: string[], makeConfig: (model: string) => CLIConfig, baseStream: StreamFn, onFallback?: (failed: string, next: string, error: string) => void): StreamFn;
//# sourceMappingURL=model-fallback.d.ts.map