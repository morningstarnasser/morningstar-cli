import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
function loadCommandsFromDir(dir, source) {
    const commands = [];
    if (!existsSync(dir))
        return commands;
    try {
        const files = readdirSync(dir).filter(f => f.endsWith(".md"));
        for (const file of files) {
            try {
                const filePath = join(dir, file);
                const content = readFileSync(filePath, "utf-8");
                const name = basename(file, ".md");
                const lines = content.split("\n");
                // First non-empty line is the description (strip leading # if present)
                const descLine = lines.find(l => l.trim().length > 0) || name;
                const description = descLine.replace(/^#+\s*/, "").trim();
                commands.push({ name, description, content, source });
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
    const projectCmds = loadCommandsFromDir(projectDir, "project");
    // Project commands override global commands with same name
    const merged = new Map();
    for (const cmd of globalCmds)
        merged.set(cmd.name, cmd);
    for (const cmd of projectCmds)
        merged.set(cmd.name, cmd);
    return Array.from(merged.values());
}
//# sourceMappingURL=custom-commands.js.map