import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { glob } from "glob";
import { trackChange, captureBeforeState } from "./undo.js";
const MAX_OUTPUT = 15000; // truncate long outputs
// ─── Active Agent Tool Filter ───
// When set, only these tools are allowed for the current agent
let _activeAgentTools = null;
export function setAgentToolFilter(tools) {
    _activeAgentTools = tools && tools.length > 0 ? new Set(tools.map(t => t.toLowerCase())) : null;
}
export function isToolAllowedForAgent(toolName) {
    if (!_activeAgentTools)
        return true;
    return _activeAgentTools.has(toolName.toLowerCase());
}
export function getAgentToolFilter() {
    if (!_activeAgentTools)
        return null;
    return Array.from(_activeAgentTools);
}
const backgroundTasks = new Map();
function generateTaskId() {
    return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
export function getBackgroundTaskStatus(taskId) {
    const task = backgroundTasks.get(taskId);
    if (!task)
        return { tool: "bg_status", result: `Task nicht gefunden: ${taskId}`, success: false };
    const elapsed = ((Date.now() - task.startTime) / 1000).toFixed(1);
    const status = task.done ? `Beendet (exit ${task.exitCode})` : `Laeuft (${elapsed}s)`;
    const output = (task.stdout + task.stderr).trim() || "(kein Output bisher)";
    return {
        tool: "bg_status",
        result: `Task: ${task.id}\nCommand: ${task.command}\nPID: ${task.pid}\nStatus: ${status}\n\n${truncate(output)}`,
        success: true,
        taskId: task.id,
    };
}
export function listBackgroundTasks() {
    if (backgroundTasks.size === 0)
        return { tool: "bg_list", result: "Keine Background-Tasks.", success: true };
    const lines = Array.from(backgroundTasks.values()).map((t) => {
        const elapsed = ((Date.now() - t.startTime) / 1000).toFixed(1);
        const status = t.done ? `done (exit ${t.exitCode})` : `running (${elapsed}s)`;
        return `  ${t.id}  ${status}  ${t.command.slice(0, 60)}`;
    });
    return { tool: "bg_list", result: lines.join("\n"), success: true };
}
// ─── Stats Tracking ───
export const toolStats = {
    calls: 0,
    byTool: {},
    filesRead: 0,
    filesWritten: 0,
    filesEdited: 0,
    filesDeleted: 0,
    bashCommands: 0,
};
function countTool(tool) {
    toolStats.calls++;
    toolStats.byTool[tool] = (toolStats.byTool[tool] || 0) + 1;
}
function truncate(s, max = MAX_OUTPUT) {
    if (s.length <= max)
        return s;
    return s.slice(0, max) + `\n...[truncated, ${s.length - max} chars omitted]`;
}
// ─── Read File ───
export function readFile(filePath, cwd, offset, limit) {
    countTool("read");
    try {
        const abs = resolve(cwd, filePath);
        if (!existsSync(abs))
            return { tool: "read", result: `Datei nicht gefunden: ${filePath}`, success: false };
        const content = readFileSync(abs, "utf-8");
        const allLines = content.split("\n");
        const totalLines = allLines.length;
        // Apply offset (1-indexed) and limit
        const startLine = offset && offset > 0 ? offset - 1 : 0;
        const endLine = limit && limit > 0 ? Math.min(startLine + limit, totalLines) : totalLines;
        const selectedLines = allLines.slice(startLine, endLine);
        const lines = selectedLines.map((l, i) => `${String(startLine + i + 1).padStart(4)} | ${l}`).join("\n");
        const rangeInfo = (offset || limit) ? `\n[Showing lines ${startLine + 1}-${endLine} of ${totalLines}]` : "";
        toolStats.filesRead++;
        return { tool: "read", result: truncate(lines) + rangeInfo, success: true, filePath, linesChanged: totalLines, startLineNumber: startLine + 1 };
    }
    catch (e) {
        return { tool: "read", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Write File ───
export function writeFile(filePath, content, cwd) {
    countTool("write");
    try {
        const abs = resolve(cwd, filePath);
        const dir = dirname(abs);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        // Track for undo
        const prev = captureBeforeState(abs);
        trackChange({
            type: "write",
            filePath: abs,
            previousContent: prev,
            newContent: content,
            timestamp: new Date().toISOString(),
            description: `write ${filePath}`,
        });
        writeFileSync(abs, content, "utf-8");
        const lineCount = content.split("\n").length;
        toolStats.filesWritten++;
        return { tool: "write", result: `Wrote ${lineCount} lines to ${filePath}`, success: true, filePath, linesChanged: lineCount };
    }
    catch (e) {
        return { tool: "write", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Edit File (find & replace) ───
export function editFile(filePath, oldStr, newStr, cwd, replaceAll = false) {
    countTool("edit");
    try {
        const abs = resolve(cwd, filePath);
        if (!existsSync(abs))
            return { tool: "edit", result: `Datei nicht gefunden: ${filePath}`, success: false };
        const content = readFileSync(abs, "utf-8");
        if (!content.includes(oldStr)) {
            return { tool: "edit", result: `String nicht gefunden in ${filePath}. Keine Aenderung.`, success: false };
        }
        const newContent = replaceAll ? content.replaceAll(oldStr, newStr) : content.replace(oldStr, newStr);
        // Track for undo
        trackChange({
            type: "edit",
            filePath: abs,
            previousContent: content,
            newContent,
            timestamp: new Date().toISOString(),
            description: `edit ${filePath}`,
        });
        writeFileSync(abs, newContent, "utf-8");
        const addedLines = newStr.split("\n").length;
        const removedLines = oldStr.split("\n").length;
        const occurrences = replaceAll ? content.split(oldStr).length - 1 : 1;
        const delta = (addedLines - removedLines) * occurrences;
        const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
        // Compute 1-based line number where the edit starts
        const editIndex = content.indexOf(oldStr);
        const startLineNumber = editIndex >= 0 ? content.substring(0, editIndex).split("\n").length : 1;
        const replaceInfo = replaceAll && occurrences > 1 ? ` (${occurrences} occurrences)` : "";
        toolStats.filesEdited++;
        return { tool: "edit", result: `Updated ${filePath} (${deltaStr} lines)${replaceInfo}`, success: true, diff: { filePath, oldStr, newStr }, filePath, linesChanged: addedLines, startLineNumber };
    }
    catch (e) {
        return { tool: "edit", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Delete File ───
export function deleteFile(filePath, cwd) {
    countTool("delete");
    try {
        const abs = resolve(cwd, filePath);
        if (!existsSync(abs))
            return { tool: "delete", result: `Datei nicht gefunden: ${filePath}`, success: false };
        // Track for undo
        const prev = captureBeforeState(abs);
        trackChange({
            type: "delete",
            filePath: abs,
            previousContent: prev,
            newContent: null,
            timestamp: new Date().toISOString(),
            description: `delete ${filePath}`,
        });
        unlinkSync(abs);
        toolStats.filesDeleted++;
        return { tool: "delete", result: `Deleted ${filePath}`, success: true, filePath };
    }
    catch (e) {
        return { tool: "delete", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Bash Execution ───
export function bash(command, cwd, timeout, runInBackground) {
    countTool("bash");
    toolStats.bashCommands++;
    // Background execution via spawn
    if (runInBackground) {
        const taskId = generateTaskId();
        const child = spawn("bash", ["-c", command], {
            cwd,
            stdio: ["pipe", "pipe", "pipe"],
            detached: false,
        });
        const task = {
            id: taskId,
            command,
            pid: child.pid || 0,
            startTime: Date.now(),
            stdout: "",
            stderr: "",
            exitCode: null,
            done: false,
        };
        child.stdout.on("data", (d) => { task.stdout += d.toString(); });
        child.stderr.on("data", (d) => { task.stderr += d.toString(); });
        child.on("close", (code) => { task.exitCode = code; task.done = true; });
        child.on("error", (err) => { task.stderr += err.message; task.done = true; task.exitCode = 1; });
        backgroundTasks.set(taskId, task);
        return { tool: "bash", result: `Background-Task gestartet: ${taskId} (PID ${task.pid})\nCommand: ${command}\nNutze bg_status mit taskId="${taskId}" um den Status zu pruefen.`, success: true, command, taskId };
    }
    // Synchronous execution with configurable timeout
    const timeoutMs = Math.min(Math.max((timeout || 30) * 1000, 1000), 600000);
    try {
        const output = execSync(command, {
            cwd,
            encoding: "utf-8",
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024 * 5,
            stdio: ["pipe", "pipe", "pipe"],
        });
        return { tool: "bash", result: truncate(output || "(kein Output)"), success: true, command };
    }
    catch (e) {
        const err = e;
        if (err.killed || err.message?.includes("TIMEOUT")) {
            const partial = (err.stdout || "") + (err.stderr || "");
            return { tool: "bash", result: truncate(`Timeout nach ${timeoutMs / 1000}s.\n${partial}`), success: false, command };
        }
        const output = (err.stdout || "") + (err.stderr || "") || err.message;
        return { tool: "bash", result: truncate(output), success: false, command };
    }
}
// ─── Grep (Content Search) ───
export function grepSearch(pattern, cwd, fileGlob, contextBefore, contextAfter, context, caseSensitive = true, maxResults = 50) {
    countTool("grep");
    try {
        // Build grep flags dynamically
        const flags = ["-rn"];
        if (!caseSensitive)
            flags.push("-i");
        if (context && context > 0)
            flags.push(`-C ${context}`);
        else {
            if (contextBefore && contextBefore > 0)
                flags.push(`-B ${contextBefore}`);
            if (contextAfter && contextAfter > 0)
                flags.push(`-A ${contextAfter}`);
        }
        const includes = fileGlob
            ? `--include="${fileGlob}"`
            : '--include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" --include="*.rs" --include="*.java" --include="*.css" --include="*.json" --include="*.md"';
        const limit = Math.min(Math.max(maxResults, 1), 500);
        const cmd = `grep ${flags.join(" ")} ${includes} "${pattern}" . 2>/dev/null | head -${limit}`;
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
    countTool("glob");
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
    countTool("ls");
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
// ─── Web Search (DuckDuckGo) ───
export async function webSearch(query) {
    countTool("web");
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; Morningstar-CLI/1.0)" },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        const html = await res.text();
        // Parse results from DuckDuckGo HTML
        const results = [];
        const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = resultRegex.exec(html)) !== null && results.length < 8) {
            const rawUrl = m[1].replace(/.*uddg=([^&]+).*/, "$1");
            const decodedUrl = decodeURIComponent(rawUrl);
            const title = m[2].replace(/<[^>]+>/g, "").trim();
            const snippet = m[3].replace(/<[^>]+>/g, "").trim();
            if (title && decodedUrl)
                results.push({ title, url: decodedUrl, snippet });
        }
        if (results.length === 0)
            return { tool: "web", result: `Keine Ergebnisse fuer: ${query}`, success: true };
        const formatted = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
        return { tool: "web", result: truncate(formatted), success: true };
    }
    catch (e) {
        return { tool: "web", result: `Web-Suche Fehler: ${e.message}`, success: false };
    }
}
// ─── Fetch URL ───
export async function fetchUrl(url) {
    countTool("fetch");
    try {
        if (!/^https?:\/\//i.test(url))
            return { tool: "fetch", result: "Nur http/https URLs erlaubt.", success: false };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; Morningstar-CLI/1.0)" },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        let text = await res.text();
        // Strip script, style, nav, footer, header tags
        text = text.replace(/<(script|style|nav|footer|header|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "");
        // Strip all HTML tags
        text = text.replace(/<[^>]+>/g, " ");
        // Decode common HTML entities
        text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
        // Collapse whitespace
        text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        // Limit length
        if (text.length > 10000)
            text = text.slice(0, 10000) + "\n...[truncated]";
        return { tool: "fetch", result: text || "(leere Seite)", success: true };
    }
    catch (e) {
        return { tool: "fetch", result: `Fetch Fehler: ${e.message}`, success: false };
    }
}
// ─── GitHub CLI ───
export function ghCli(command, cwd) {
    countTool("gh");
    // Block destructive commands
    const blocked = ["repo delete", "repo archive", "auth logout"];
    for (const b of blocked) {
        if (command.startsWith(b))
            return { tool: "gh", result: `Blockiert: 'gh ${b}' ist nicht erlaubt.`, success: false };
    }
    try {
        const output = execSync(`gh ${command}`, {
            cwd,
            encoding: "utf-8",
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 2,
            stdio: ["pipe", "pipe", "pipe"],
        });
        return { tool: "gh", result: truncate(output || "(kein Output)"), success: true };
    }
    catch (e) {
        const err = e;
        const msg = (err.stderr || err.stdout || err.message || "").trim();
        if (msg.includes("not found") || msg.includes("command not found") || msg.includes("not recognized")) {
            return { tool: "gh", result: "GitHub CLI (gh) ist nicht installiert. Installieren: https://cli.github.com/", success: false };
        }
        return { tool: "gh", result: truncate(msg), success: false };
    }
}
// ─── Git Status ───
export function gitStatus(cwd) {
    countTool("git");
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
// ─── Notebook Edit (.ipynb) ───
export function notebookEdit(notebookPath, cellNumber, editMode, cwd, cellType, newSource) {
    countTool("notebook_edit");
    try {
        const abs = resolve(cwd, notebookPath);
        if (!existsSync(abs))
            return { tool: "notebook_edit", result: `Notebook nicht gefunden: ${notebookPath}`, success: false };
        const raw = readFileSync(abs, "utf-8");
        const nb = JSON.parse(raw);
        if (!nb.cells || !Array.isArray(nb.cells))
            return { tool: "notebook_edit", result: "Ungueltige Notebook-Struktur (keine cells).", success: false };
        const prevContent = raw;
        switch (editMode) {
            case "replace": {
                if (cellNumber < 0 || cellNumber >= nb.cells.length)
                    return { tool: "notebook_edit", result: `Cell ${cellNumber} existiert nicht (0-${nb.cells.length - 1}).`, success: false };
                if (!newSource && newSource !== "")
                    return { tool: "notebook_edit", result: "newSource ist erforderlich fuer replace.", success: false };
                const sourceLines = newSource.split("\n").map((l, i, arr) => i < arr.length - 1 ? l + "\n" : l);
                nb.cells[cellNumber].source = sourceLines;
                if (cellType)
                    nb.cells[cellNumber].cell_type = cellType;
                break;
            }
            case "insert": {
                if (!cellType)
                    return { tool: "notebook_edit", result: "cellType ist erforderlich fuer insert.", success: false };
                const sourceLines = (newSource || "").split("\n").map((l, i, arr) => i < arr.length - 1 ? l + "\n" : l);
                const newCell = {
                    cell_type: cellType,
                    metadata: {},
                    source: sourceLines,
                };
                if (cellType === "code") {
                    newCell.execution_count = null;
                    newCell.outputs = [];
                }
                const insertIdx = Math.min(Math.max(cellNumber, 0), nb.cells.length);
                nb.cells.splice(insertIdx, 0, newCell);
                break;
            }
            case "delete": {
                if (cellNumber < 0 || cellNumber >= nb.cells.length)
                    return { tool: "notebook_edit", result: `Cell ${cellNumber} existiert nicht (0-${nb.cells.length - 1}).`, success: false };
                nb.cells.splice(cellNumber, 1);
                break;
            }
        }
        const newContent = JSON.stringify(nb, null, 1);
        // Track for undo
        trackChange({
            type: "edit",
            filePath: abs,
            previousContent: prevContent,
            newContent,
            timestamp: new Date().toISOString(),
            description: `notebook_edit ${notebookPath} cell ${cellNumber} (${editMode})`,
        });
        writeFileSync(abs, newContent, "utf-8");
        toolStats.filesEdited++;
        return { tool: "notebook_edit", result: `Notebook ${notebookPath}: cell ${cellNumber} ${editMode}d. Total cells: ${nb.cells.length}`, success: true, filePath: notebookPath };
    }
    catch (e) {
        return { tool: "notebook_edit", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Parse & Execute Tool Calls from AI Response ───
export async function executeToolCalls(response, cwd) {
    const results = [];
    // Strip <br> tags that some models inject between tool calls
    response = response.replace(/<br\s*\/?>/gi, "\n");
    let cleanResponse = response;
    // Parse <tool> blocks: <tool:name>args</tool> or <tool:name>args</tool:name>
    const toolRegex = /<tool:(\w+)>([\s\S]*?)<\/tool(?::\w+)?>/g;
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
                    if (pathMatch) {
                        result = writeFile(pathMatch[1].trim(), pathMatch[2], cwd);
                    }
                    else {
                        // Model sent <tool:write>path</tool> without content — smart fallback
                        let filePath = args.trim();
                        const afterTool = response.slice((match.index ?? 0) + fullMatch.length);
                        // Check if there's a filename between </tool> and the code block (e.g. "index.html\n```html\n...")
                        const codeWithNameMatch = afterTool.match(/^\s*\n?([\w][\w.\-]*\.\w+)\s*\n```\w*\n([\s\S]*?)```/);
                        // Check for ```lang\n...\n``` code blocks — allow ANY text between </tool> and the code block
                        // Models often write explanatory text before the code block
                        const codeMatch = afterTool.match(/```\w*\n([\s\S]*?)```/);
                        // Check for <code>\n...\n</code> blocks (some models use this)
                        const codeTagMatch = afterTool.match(/<code>\n?([\s\S]*?)<\/code>/);
                        if (codeWithNameMatch) {
                            // Append the filename to the path (e.g. /tmp/snake-game + index.html)
                            const extraName = codeWithNameMatch[1];
                            filePath = filePath.endsWith("/") ? filePath + extraName : filePath + "/" + extraName;
                            const dir = dirname(resolve(cwd, filePath));
                            if (!existsSync(dir))
                                mkdirSync(dir, { recursive: true });
                            result = writeFile(filePath, codeWithNameMatch[2], cwd);
                            cleanResponse = cleanResponse.replace(codeWithNameMatch[0], "");
                        }
                        else if (codeMatch) {
                            const dir = dirname(resolve(cwd, filePath));
                            if (!existsSync(dir))
                                mkdirSync(dir, { recursive: true });
                            result = writeFile(filePath, codeMatch[1], cwd);
                            cleanResponse = cleanResponse.replace(codeMatch[0], "");
                        }
                        else if (codeTagMatch) {
                            // <code>...</code> blocks
                            const dir = dirname(resolve(cwd, filePath));
                            if (!existsSync(dir))
                                mkdirSync(dir, { recursive: true });
                            result = writeFile(filePath, codeTagMatch[1], cwd);
                            cleanResponse = cleanResponse.replace(codeTagMatch[0], "");
                        }
                        else if (!filePath.includes(".")) {
                            // Path has no extension — treat as mkdir (model meant to create directory)
                            const abs = resolve(cwd, filePath);
                            if (!existsSync(abs))
                                mkdirSync(abs, { recursive: true });
                            result = { tool: "write", result: `Verzeichnis erstellt: ${filePath}`, success: true };
                        }
                        else {
                            result = { tool: "write", result: `Format: pfad\\ninhalt`, success: false };
                        }
                    }
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
                case "web": {
                    result = await webSearch(args.trim());
                    break;
                }
                case "fetch": {
                    result = await fetchUrl(args.trim());
                    break;
                }
                case "gh": {
                    result = ghCli(args.trim(), cwd);
                    break;
                }
                case "create":
                case "mkdir": {
                    // Models sometimes use <tool:create>path</tool> — treat as mkdir -p
                    const dirPath = args.trim().replace(/^.*?([\/~].+)$/, "$1"); // extract path from text
                    if (dirPath.startsWith("/") || dirPath.startsWith("~")) {
                        result = bash(`mkdir -p "${dirPath}"`, cwd);
                        result.tool = "create";
                    }
                    else {
                        result = { tool: "create", result: `Kein gültiger Pfad: ${args.trim()}`, success: false };
                    }
                    break;
                }
                default:
                    result = { tool: toolName, result: `Unbekanntes Tool: ${toolName}. Verfuegbare Tools: read, write, edit, delete, bash, grep, glob, ls, git, web, fetch, gh. Fuer Verschieben nutze <tool:bash>mv quelle ziel</tool>, fuer Kopieren <tool:bash>cp quelle ziel</tool>.`, success: false };
            }
        }
        catch (e) {
            result = { tool: toolName, result: `Fehler: ${e.message}`, success: false };
        }
        results.push(result);
        cleanResponse = cleanResponse.replace(fullMatch, "");
    }
    // ─── Unclosed Tool Tags: <tool:write>path\n```lang\ncontent\n``` (no </tool>) ───
    if (results.length === 0) {
        const unclosedWriteRegex = /<tool:write>([^\n<]+)\n```\w*\n([\s\S]*?)```/g;
        let uwMatch;
        while ((uwMatch = unclosedWriteRegex.exec(response)) !== null) {
            const [fullBlock, filePath, content] = uwMatch;
            const trimmedPath = filePath.trim();
            if (!trimmedPath)
                continue;
            try {
                const abs = resolve(cwd, trimmedPath);
                const dir = dirname(abs);
                if (!existsSync(dir))
                    mkdirSync(dir, { recursive: true });
                const r = writeFile(trimmedPath, content, cwd);
                results.push(r);
            }
            catch (e) {
                results.push({ tool: "write", result: `Fehler: ${e.message}`, success: false });
            }
            cleanResponse = cleanResponse.replace(fullBlock, "");
        }
        // Also handle unclosed <tool:bash>command (no </tool>)
        const unclosedBashRegex = /<tool:bash>([^\n<]+)(?:\n|$)/g;
        let ubMatch;
        while ((ubMatch = unclosedBashRegex.exec(response)) !== null) {
            const [fullBlock, command] = ubMatch;
            const trimmed = command.trim();
            if (!trimmed)
                continue;
            try {
                const r = bash(trimmed, cwd);
                results.push(r);
            }
            catch (e) {
                results.push({ tool: "bash", result: `Fehler: ${e.message}`, success: false });
            }
            cleanResponse = cleanResponse.replace(fullBlock, "");
        }
    }
    // ─── Auto-Execute Code Blocks (for models that don't use <tool:> tags) ───
    if (results.length === 0) {
        const codeBlockRegex = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
        const pyBlockRegex = /```python\n([\s\S]*?)```/g;
        let cbMatch;
        while ((cbMatch = codeBlockRegex.exec(response)) !== null) {
            const [fullBlock, code] = cbMatch;
            const trimmed = code.trim();
            if (!trimmed)
                continue;
            // Skip code blocks that contain tool tags (already handled above)
            if (/<tool:\w+>/.test(trimmed))
                continue;
            try {
                const result = bash(trimmed, cwd);
                results.push({ ...result, tool: "auto-bash" });
            }
            catch (e) {
                results.push({ tool: "auto-bash", result: `Fehler: ${e.message}`, success: false });
            }
            cleanResponse = cleanResponse.replace(fullBlock, "");
        }
        while ((cbMatch = pyBlockRegex.exec(response)) !== null) {
            const [fullBlock, code] = cbMatch;
            const trimmed = code.trim();
            if (!trimmed)
                continue;
            // Skip code blocks that contain tool tags
            if (/<tool:\w+>/.test(trimmed))
                continue;
            // Write to temp file and execute (avoids shell escaping issues)
            const tmpFile = `/tmp/morningstar_auto_${Date.now()}.py`;
            try {
                writeFileSync(tmpFile, trimmed, "utf-8");
                const result = bash(`python3 "${tmpFile}"`, cwd);
                results.push({ ...result, tool: "auto-python" });
                try {
                    unlinkSync(tmpFile);
                }
                catch { }
            }
            catch (e) {
                results.push({ tool: "auto-python", result: `Fehler: ${e.message}`, success: false });
                try {
                    unlinkSync(tmpFile);
                }
                catch { }
            }
            cleanResponse = cleanResponse.replace(fullBlock, "");
        }
        // ─── Auto-Write HTML code blocks ONLY when it's real HTML ───
        const htmlBlockRegex = /```html\n([\s\S]*?)```/g;
        let htmlMatch;
        while ((htmlMatch = htmlBlockRegex.exec(response)) !== null) {
            const [fullBlock, code] = htmlMatch;
            const trimmed = code.trim();
            if (!trimmed || trimmed.length < 100)
                continue;
            if (/<tool:\w+>/.test(trimmed))
                continue;
            // Validate: must look like actual HTML, NOT React/JSX
            const looksLikeHTML = /<!DOCTYPE|<html|<head|<body/i.test(trimmed);
            const looksLikeReact = /import\s+React|from\s+['"]react|useState|useEffect|className=/i.test(trimmed);
            if (!looksLikeHTML || looksLikeReact)
                continue;
            const beforeBlock = response.slice(0, htmlMatch.index);
            const pathMatch = beforeBlock.match(/([\/~][\w\/\-. ]+\.(?:html|htm))/i)
                || beforeBlock.match(/([\w][\w\-]*\.(?:html|htm))/i);
            let targetPath;
            if (pathMatch) {
                const detected = pathMatch[1].trim();
                targetPath = detected.startsWith("/") || detected.startsWith("~") ? detected : resolve(cwd, detected);
            }
            else {
                targetPath = resolve(cwd, "index.html");
            }
            try {
                const dir = dirname(targetPath);
                if (!existsSync(dir))
                    mkdirSync(dir, { recursive: true });
                const r = writeFile(targetPath, trimmed, cwd);
                results.push({ ...r, tool: "auto-html" });
            }
            catch (e) {
                results.push({ tool: "auto-html", result: `Fehler: ${e.message}`, success: false });
            }
            cleanResponse = cleanResponse.replace(fullBlock, "");
        }
    }
    return { results, cleanResponse: cleanResponse.trim() };
}
// ─── Native Function Calling Executor ────────────────────────────────────────
// Used by providers with native tool/function calling support (OpenAI, Anthropic, Google, Groq, OpenRouter).
// Takes the parsed tool name and arguments object directly instead of regex-parsing from text.
export function executeNativeToolCall(name, args, cwd) {
    // Check agent tool restrictions
    if (!isToolAllowedForAgent(name)) {
        return { tool: name, result: `Tool "${name}" ist fuer diesen Agent nicht erlaubt.`, success: false };
    }
    countTool(name);
    switch (name) {
        case "read":
            return readFile(args.filePath, cwd, args.offset, args.limit);
        case "write":
            return writeFile(args.filePath, args.content, cwd);
        case "edit":
            return editFile(args.filePath, args.oldStr, args.newStr, cwd, args.replaceAll);
        case "delete":
            return deleteFile(args.filePath, cwd);
        case "bash":
            toolStats.bashCommands++;
            return bash(args.command, cwd, args.timeout, args.run_in_background);
        case "grep":
            return grepSearch(args.pattern, cwd, args.fileGlob || undefined, args.contextBefore, args.contextAfter, args.context, args.caseSensitive !== false, args.maxResults || 50);
        case "glob":
            return globSearch(args.pattern, cwd);
        case "ls":
            return listDir(args.dirPath || ".", cwd);
        case "git":
            return gitStatus(cwd);
        case "web":
            return webSearch(args.query);
        case "fetch":
            return fetchUrl(args.url);
        case "gh":
            return ghCli(args.command, cwd);
        case "notebook_edit":
            return notebookEdit(args.notebookPath, args.cellNumber, args.editMode, cwd, args.cellType, args.newSource);
        case "bg_status":
            return getBackgroundTaskStatus(args.taskId);
        case "bg_list":
            return listBackgroundTasks();
        default:
            return { tool: name, result: `Unbekanntes Tool: ${name}`, success: false };
    }
}
// ─── Parallel Native Tool Execution ──────────────────────────────────────────
// Executes safe/read-only tools in parallel, mutating tools sequentially.
const SAFE_TOOLS = new Set(["read", "grep", "glob", "ls", "git", "web", "fetch", "bg_status", "bg_list", "notebook_edit"]);
export async function executeNativeToolCallsParallel(calls, cwd) {
    if (calls.length === 0)
        return [];
    if (calls.length === 1) {
        const c = calls[0];
        const r = await Promise.resolve(executeNativeToolCall(c.name, c.arguments, cwd));
        return [r];
    }
    // Split into safe (parallelizable) and mutating (sequential) batches
    const results = new Array(calls.length);
    const safeBatch = [];
    for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        if (SAFE_TOOLS.has(call.name)) {
            safeBatch.push({ index: i, call });
        }
        else {
            // Flush safe batch first (parallel)
            if (safeBatch.length > 0) {
                const safeResults = await Promise.all(safeBatch.map(({ call: c }) => Promise.resolve(executeNativeToolCall(c.name, c.arguments, cwd))));
                for (let j = 0; j < safeBatch.length; j++) {
                    results[safeBatch[j].index] = safeResults[j];
                }
                safeBatch.length = 0;
            }
            // Execute mutating tool sequentially
            results[i] = await Promise.resolve(executeNativeToolCall(call.name, call.arguments, cwd));
        }
    }
    // Flush remaining safe batch
    if (safeBatch.length > 0) {
        const safeResults = await Promise.all(safeBatch.map(({ call: c }) => Promise.resolve(executeNativeToolCall(c.name, c.arguments, cwd))));
        for (let j = 0; j < safeBatch.length; j++) {
            results[safeBatch[j].index] = safeResults[j];
        }
    }
    return results;
}
//# sourceMappingURL=tools.js.map