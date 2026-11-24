import { appendFileSync, existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveWithinWorkspace } from "./file-guards.js";
const MEMORY_FILES = ["MORNINGSTAR.md", ".morningstar.md", ".morningstar/config.md"];
function getSafeExistingMemoryPath(cwd, name) {
    const lexicalPath = join(cwd, name);
    try {
        if (!existsSync(lexicalPath))
            return null;
        const lexicalStat = lstatSync(lexicalPath);
        if (!lexicalStat.isFile() || lexicalStat.isSymbolicLink() || lexicalStat.size > 131072)
            return null;
        const checked = resolveWithinWorkspace(lexicalPath, cwd);
        if (!checked.ok)
            return null;
        const resolvedStat = lstatSync(checked.resolved);
        return resolvedStat.isFile() && !resolvedStat.isSymbolicLink()
            ? checked.resolved
            : null;
    }
    catch {
        return null;
    }
}
/** Existing Morningstar memory plus project guidance; AGENTS takes precedence over CLAUDE. */
export function loadProjectMemory(cwd) {
    const names = [...MEMORY_FILES];
    const primary = getSafeExistingMemoryPath(cwd, "AGENTS.md") ? "AGENTS.md" : "CLAUDE.md";
    names.push(primary, "MORNINGSTAR.local.md", "CLAUDE.local.md");
    const chunks = [];
    let size = 0;
    for (const name of names) {
        const path = getSafeExistingMemoryPath(cwd, name);
        if (!path)
            continue;
        try {
            const content = readFileSync(path, "utf8");
            size += Buffer.byteLength(content);
            if (size > 262144)
                break;
            chunks.push(`<!-- Project guidance: ${name} -->\n${content}`);
        }
        catch { }
    }
    return chunks.length ? chunks.join("\n\n") : null;
}
export function getProjectMemoryPath(cwd) {
    for (const name of MEMORY_FILES) {
        const path = getSafeExistingMemoryPath(cwd, name);
        if (path)
            return path;
    }
    return null;
}
export function createProjectMemory(cwd, context) {
    const lexicalPath = join(cwd, "MORNINGSTAR.md");
    let existingStat;
    try {
        existingStat = lstatSync(lexicalPath);
    }
    catch { }
    if (existingStat?.isSymbolicLink()) {
        throw new Error("MORNINGSTAR.md darf kein symbolischer Link sein.");
    }
    const checked = resolveWithinWorkspace(lexicalPath, cwd);
    if (!checked.ok) {
        throw new Error(checked.reason || "MORNINGSTAR.md liegt ausserhalb des Arbeitsverzeichnisses.");
    }
    const path = checked.resolved;
    const content = `# ${context.projectName || "Projekt"}

## Tech Stack
- Language: ${context.language || "(hier eintragen)"}
- Framework: ${context.framework || "(hier eintragen)"}

## Conventions
- (Coding-Konventionen hier eintragen)

## Important
- (Wichtige Hinweise fuer die AI hier eintragen)

## Do NOT
- (Was die AI NICHT tun soll)

## Scripts
- \`npm run dev\` — Development Server
- \`npm test\` — Tests ausfuehren
- \`npm run build\` — Build
`;
    writeFileSync(path, content, "utf-8");
    return path;
}
export function appendProjectMemory(cwd, text) {
    const path = getProjectMemoryPath(cwd);
    if (!path)
        return false;
    try {
        appendFileSync(path, "\n" + text + "\n", "utf-8");
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=project-memory.js.map