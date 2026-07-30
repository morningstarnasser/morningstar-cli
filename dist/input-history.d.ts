/**
 * Inputs that look like credentials must never be persisted to disk. This is
 * deliberately conservative: losing one history entry is safer than retaining
 * a secret in plaintext.
 */
export declare function isSensitiveInput(input: string): boolean;
/**
 * Add an input to the persistent history.
 */
export declare function addToInputHistory(input: string): void;
/**
 * Search input history by query.
 */
export declare function searchInputHistory(query: string): string[];
/**
 * Get all input history entries (most recent first).
 */
export declare function getInputHistory(): string[];
/**
 * Clear input history.
 */
export declare function clearInputHistory(): void;
//# sourceMappingURL=input-history.d.ts.map