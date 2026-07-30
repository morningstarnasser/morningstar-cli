export declare const MAX_READ_SIZE: number;
export declare const MAX_WRITE_SIZE: number;
/** A NUL byte in the first chunk is a strong binary signal (matches git heuristics). */
export declare function isBinaryContent(buf: Buffer | string): boolean;
export interface BoundaryCheck {
    ok: boolean;
    resolved: string;
    reason?: string;
}
/**
 * Resolve `target` and verify it stays within `cwd` (after following symlinks on
 * the existing portion of the path). Blocks `../` escapes and symlink escapes.
 * Pure given the filesystem; `realpath`/`exists` injectable for testing.
 */
export declare function resolveWithinWorkspace(target: string, cwd: string, realpath?: (p: string) => string, exists?: (p: string) => boolean): BoundaryCheck;
/**
 * Validate a glob/include pattern as a workspace-scoped path. Parent segments
 * are refused even when they appear after wildcard components, then the same
 * nearest-existing-ancestor check catches symlinked pattern prefixes.
 */
export declare function resolvePatternWithinWorkspace(pattern: string, cwd: string, realpath?: (p: string) => string, exists?: (p: string) => boolean): BoundaryCheck;
/** Guard a read: returns an error reason or null if allowed. */
export declare function guardRead(size: number, sample: Buffer | string): string | null;
/** Guard a write: returns an error reason or null if allowed. */
export declare function guardWrite(contentLength: number): string | null;
//# sourceMappingURL=file-guards.d.ts.map