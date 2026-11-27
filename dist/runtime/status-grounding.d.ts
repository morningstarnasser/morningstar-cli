import type { Message, ToolResult } from "../types.js";
/** A new status request about a previously measured endpoint needs a new read.
 * Historical questions and unrelated status/code tasks are deliberately excluded. */
export declare function requestsFreshKnownStatus(messages: Message[]): boolean;
/** Narrow guard for observed German blanket-health conclusions after known
 * snapshots. It is not a general fact checker; raw model deltas remain unchanged. */
export declare function scopeStatusConclusion(text: string, results: ToolResult[]): string;
//# sourceMappingURL=status-grounding.d.ts.map