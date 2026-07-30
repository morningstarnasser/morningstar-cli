import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter } from "./frontmatter.js";
import { resolveWithinWorkspace } from "./file-guards.js";
function loadCommandsFromDir(dir, source, boundaryRoot) {
    const commands = [];
    if (!existsSync(dir))
        return commands;
    try {
        // A commands directory or file may be supplied by an untrusted project.
        // Never follow links here: command content is injected into the next prompt.
        if (lstatSync(dir).isSymbolicLink())
            return commands;
        const checkedDir = boundaryRoot
            ? resolveWithinWorkspace(dir, boundaryRoot)
            : { ok: true, resolved: dir };
        if (!checkedDir.ok || !lstatSync(checkedDir.resolved).isDirectory())
            return commands;
        const files = readdirSync(checkedDir.resolved, { withFileTypes: true })
            .filter(entry => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".md"));
        for (const file of files) {
            try {
                const filePath = join(checkedDir.resolved, file.name);
                const fileStat = lstatSync(filePath);
                if (!fileStat.isFile() || fileStat.isSymbolicLink())
                    continue;
                if (boundaryRoot && !resolveWithinWorkspace(filePath, boundaryRoot).ok)
                    continue;
                const raw = readFileSync(filePath, "utf-8");
                const name = basename(file.name, ".md");
                // Try frontmatter first (ECC format), fallback to first-line description
                const { frontmatter, content } = parseFrontmatter(raw);
                let description;
                if (frontmatter.description) {
                    description = frontmatter.description;
                }
                else {
                    const lines = content.split("\n");
                    const descLine = lines.find(l => l.trim().length > 0) || name;
                    description = descLine.replace(/^#+\s*/, "").trim();
                }
                commands.push({
                    name,
                    description,
                    content,
                    source,
                    agent: frontmatter.agent,
                });
            }
            catch { }
        }
    }
    catch { }
    return commands;
}
export function loadCustomCommands(cwd) {
    const globalDir = join(homedir(), ".morningstar", "commands");
    const projectDir = join(cwd, ".morningstar", "commands");
    const globalCmds = loadCommandsFromDir(globalDir, "global");
    const projectCmds = loadCommandsFromDir(projectDir, "project", cwd);
    // Project commands override global commands with same name
    const merged = new Map();
    for (const cmd of globalCmds)
        merged.set(cmd.name, cmd);
    for (const cmd of projectCmds)
        merged.set(cmd.name, cmd);
    return Array.from(merged.values());
}
//# sourceMappingURL=custom-commands.js.map