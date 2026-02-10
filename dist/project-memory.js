import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
const MEMORY_FILES = ["MORNINGSTAR.md", ".morningstar.md", ".morningstar/config.md"];
export function loadProjectMemory(cwd) {
    for (const name of MEMORY_FILES) {
        const path = join(cwd, name);
        try {
            if (existsSync(path))
                return readFileSync(path, "utf-8");
        }
        catch { }
    }
    return null;
}
export function getProjectMemoryPath(cwd) {
    for (const name of MEMORY_FILES) {
        const path = join(cwd, name);
        if (existsSync(path))
            return path;
    }
    return null;
}
export function createProjectMemory(cwd, context) {
    const path = join(cwd, "MORNINGSTAR.md");
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