// ─── File Guards (#2, from claw-code's file-tool edge cases) ─────────────────
// Edge-case protection for read/write tools: binary detection, size limits, and
// workspace-boundary / symlink-escape checks. Pure functions so they're fully
// testable; the tools layer calls them before touching the filesystem.
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { realpathSync, existsSync } from "node:fs";
export const MAX_READ_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_WRITE_SIZE = 10 * 1024 * 1024; // 10 MB
/** A NUL byte in the first chunk is a strong binary signal (matches git heuristics). */
export function isBinaryContent(buf) {
    const bytes = typeof buf === "string" ? Buffer.from(buf, "utf-8") : buf;
    const len = Math.min(bytes.length, 8000);
    for (let i = 0; i < len; i++)
        if (bytes[i] === 0)
            return true;
    return false;
}
/**
 * Resolve `target` and verify it stays within `cwd` (after following symlinks on
 * the existing portion of the path). Blocks `../` escapes and symlink escapes.
 * Pure given the filesystem; `realpath`/`exists` injectable for testing.
 */
export function resolveWithinWorkspace(target, cwd, realpath = realpathSync, exists = existsSync) {
    const lexicalCwd = resolve(cwd);
    const resolvedCwd = exists(lexicalCwd) ? safeReal(lexicalCwd, realpath) : lexicalCwd;
    const requested = resolve(resolvedCwd, target);
    // Resolve the nearest existing ancestor. This is important for writes such as
    // `symlink-to-outside/new-file`: the final file does not exist yet, but its
    // existing symlinked parent already proves that the write would escape.
    let ancestor = requested;
    const missingParts = [];
    while (!exists(ancestor)) {
        const parent = dirname(ancestor);
        if (parent === ancestor)
            break;
        missingParts.unshift(basename(ancestor));
        ancestor = parent;
    }
    const realAncestor = exists(ancestor) ? safeReal(ancestor, realpath) : ancestor;
    const real = resolve(realAncestor, ...missingParts);
    const rel = relative(resolvedCwd, real);
    const escapes = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
    if (escapes) {
        return { ok: false, resolved: real, reason: `Pfad ausserhalb des Arbeitsverzeichnisses: ${real}` };
    }
    return { ok: true, resolved: real };
}
/**
 * Validate a glob/include pattern as a workspace-scoped path. Parent segments
 * are refused even when they appear after wildcard components, then the same
 * nearest-existing-ancestor check catches symlinked pattern prefixes.
 */
export function resolvePatternWithinWorkspace(pattern, cwd, realpath = realpathSync, exists = existsSync) {
    if (pattern.includes("\0")) {
        return { ok: false, resolved: pattern, reason: "Pfad enthaelt ein ungueltiges NUL-Zeichen." };
    }
    const segments = pattern.replaceAll("\\", "/").split("/");
    if (segments.includes("..")) {
        return { ok: false, resolved: resolve(cwd, pattern), reason: `Pfadmuster ausserhalb des Arbeitsverzeichnisses: ${pattern}` };
    }
    return resolveWithinWorkspace(pattern || ".", cwd, realpath, exists);
}
function safeReal(p, realpath) {
    try {
        return realpath(p);
    }
    catch {
        return resolve(p);
    }
}
/** Guard a read: returns an error reason or null if allowed. */
export function guardRead(size, sample) {
    if (size > MAX_READ_SIZE)
        return `Datei zu gross (${Math.round(size / 1024 / 1024)} MB > ${MAX_READ_SIZE / 1024 / 1024} MB).`;
    if (isBinaryContent(sample))
        return "Binärdatei — nicht als Text lesbar.";
    return null;
}
/** Guard a write: returns an error reason or null if allowed. */
export function guardWrite(contentLength) {
    if (contentLength > MAX_WRITE_SIZE)
        return `Inhalt zu gross (${Math.round(contentLength / 1024 / 1024)} MB > ${MAX_WRITE_SIZE / 1024 / 1024} MB).`;
    return null;
}
//# sourceMappingURL=file-guards.js.map