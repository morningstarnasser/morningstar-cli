import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { glob } from "glob";
const MAX_OUTPUT = 15000; // truncate long outputs
function truncate(s, max = MAX_OUTPUT) {
    if (s.length <= max)
        return s;
    return s.slice(0, max) + `\n...[truncated, ${s.length - max} chars omitted]`;
}
// ─── Read File ───
export function readFile(filePath, cwd) {
    try {
        const abs = resolve(cwd, filePath);
        if (!existsSync(abs))
            return { tool: "read", result: `Datei nicht gefunden: ${filePath}`, success: false };
        const content = readFileSync(abs, "utf-8");
        const lines = content.split("\n").map((l, i) => `${String(i + 1).padStart(4)} | ${l}`).join("\n");
        return { tool: "read", result: truncate(lines), success: true };
    }
    catch (e) {
        return { tool: "read", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Write File ───
export function writeFile(filePath, content, cwd) {
    try {
        const abs = resolve(cwd, filePath);
        const dir = dirname(abs);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        writeFileSync(abs, content, "utf-8");
        return { tool: "write", result: `Datei geschrieben: ${filePath} (${content.length} Zeichen)`, success: true };
    }
    catch (e) {
        return { tool: "write", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Edit File (find & replace) ───
export function editFile(filePath, oldStr, newStr, cwd) {
    try {
        const abs = resolve(cwd, filePath);
        if (!existsSync(abs))
            return { tool: "edit", result: `Datei nicht gefunden: ${filePath}`, success: false };
        const content = readFileSync(abs, "utf-8");
        if (!content.includes(oldStr)) {
            return { tool: "edit", result: `String nicht gefunden in ${filePath}. Keine Aenderung.`, success: false };
        }
        const newContent = content.replace(oldStr, newStr);
        writeFileSync(abs, newContent, "utf-8");
        return { tool: "edit", result: `Datei bearbeitet: ${filePath}`, success: true };
    }
    catch (e) {
        return { tool: "edit", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Delete File ───
export function deleteFile(filePath, cwd) {
    try {
        const abs = resolve(cwd, filePath);
        if (!existsSync(abs))
            return { tool: "delete", result: `Datei nicht gefunden: ${filePath}`, success: false };
        unlinkSync(abs);
        return { tool: "delete", result: `Datei geloescht: ${filePath}`, success: true };
    }
    catch (e) {
        return { tool: "delete", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Bash Execution ───
export function bash(command, cwd) {
    try {
        const output = execSync(command, {
            cwd,
            encoding: "utf-8",
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 5,
            stdio: ["pipe", "pipe", "pipe"],
        });
        return { tool: "bash", result: truncate(output || "(kein Output)"), success: true };
    }
    catch (e) {
        const err = e;
        const output = (err.stdout || "") + (err.stderr || "") || err.message;
        return { tool: "bash", result: truncate(output), success: false };
    }
}
// ─── Grep (Content Search) ───
export function grepSearch(pattern, cwd, fileGlob) {
    try {
        const cmd = fileGlob
            ? `grep -rn --include="${fileGlob}" "${pattern}" . 2>/dev/null | head -50`
            : `grep -rn "${pattern}" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" --include="*.rs" --include="*.java" --include="*.css" --include="*.json" --include="*.md" 2>/dev/null | head -50`;
        const output = execSync(cmd, { cwd, encoding: "utf-8", timeout: 10000, maxBuffer: 1024 * 512 });
        if (!output.trim())
            return { tool: "grep", result: "Keine Treffer.", success: true };
        return { tool: "grep", result: truncate(output), success: true };
    }
    catch {
        return { tool: "grep", result: "Keine Treffer.", success: true };
    }
}
// ─── Glob (File Search) ───
export async function globSearch(pattern, cwd) {
    try {
        const files = await glob(pattern, { cwd, ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.next/**"], nodir: true });
        if (files.length === 0)
            return { tool: "glob", result: "Keine Dateien gefunden.", success: true };
        const sorted = files.sort().slice(0, 100);
        return { tool: "glob", result: sorted.join("\n") + (files.length > 100 ? `\n...(+${files.length - 100} weitere)` : ""), success: true };
    }
    catch (e) {
        return { tool: "glob", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── List Directory ───
export function listDir(dirPath, cwd) {
    try {
        const abs = resolve(cwd, dirPath || ".");
        if (!existsSync(abs))
            return { tool: "ls", result: `Verzeichnis nicht gefunden: ${dirPath}`, success: false };
        const entries = readdirSync(abs).map((name) => {
            const full = join(abs, name);
            try {
                const stat = statSync(full);
                return stat.isDirectory() ? `  ${name}/` : `  ${name} (${formatSize(stat.size)})`;
            }
            catch {
                return `  ${name}`;
            }
        });
        return { tool: "ls", result: entries.join("\n") || "(leer)", success: true };
    }
    catch (e) {
        return { tool: "ls", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Git Status ───
export function gitStatus(cwd) {
    try {
        const status = execSync("git status --short && echo '---' && git log --oneline -5", {
            cwd, encoding: "utf-8", timeout: 5000,
        });
        const branch = execSync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
        return { tool: "git", result: `Branch: ${branch}\n${status}`, success: true };
    }
    catch (e) {
        return { tool: "git", result: `Git Fehler: ${e.message}`, success: false };
    }
}
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1048576)
        return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1048576).toFixed(1)}MB`;
}
// ─── Parse & Execute Tool Calls from AI Response ───
export async function executeToolCalls(response, cwd) {
    const results = [];
    let cleanResponse = response;
    // Parse <tool> blocks: <tool:name>args</tool>
    const toolRegex = /<tool:(\w+)>([\s\S]*?)<\/tool>/g;
    let match;
    while ((match = toolRegex.exec(response)) !== null) {
        const [fullMatch, toolName, args] = match;
        let result;
        try {
            switch (toolName) {
                case "read": {
                    result = readFile(args.trim(), cwd);
                    break;
                }
                case "write": {
                    const pathMatch = args.match(/^([^\n]+)\n([\s\S]*)$/);
                    if (!pathMatch) {
                        result = { tool: "write", result: "Format: pfad\\ninhalt", success: false };
                        break;
                    }
                    result = writeFile(pathMatch[1].trim(), pathMatch[2], cwd);
                    break;
                }
                case "edit": {
                    const editMatch = args.match(/^([^\n]+)\n<<<\n([\s\S]*?)\n>>>\n([\s\S]*)$/);
                    if (!editMatch) {
                        result = { tool: "edit", result: "Format: pfad\\n<<<\\nold\\n>>>\\nnew", success: false };
                        break;
                    }
                    result = editFile(editMatch[1].trim(), editMatch[2], editMatch[3], cwd);
                    break;
                }
                case "delete": {
                    result = deleteFile(args.trim(), cwd);
                    break;
                }
                case "bash": {
                    result = bash(args.trim(), cwd);
                    break;
                }
                case "grep": {
                    const grepParts = args.trim().split("\n");
                    result = grepSearch(grepParts[0], cwd, grepParts[1]);
                    break;
                }
                case "glob": {
                    result = await globSearch(args.trim(), cwd);
                    break;
                }
                case "ls": {
                    result = listDir(args.trim(), cwd);
                    break;
                }
                case "git": {
                    result = gitStatus(cwd);
                    break;
                }
                default:
                    result = { tool: toolName, result: `Unbekanntes Tool: ${toolName}`, success: false };
            }
        }
        catch (e) {
            result = { tool: toolName, result: `Fehler: ${e.message}`, success: false };
        }
        results.push(result);
        cleanResponse = cleanResponse.replace(fullMatch, "");
    }
    return { results, cleanResponse: cleanResponse.trim() };
}
//# sourceMappingURL=tools.js.map