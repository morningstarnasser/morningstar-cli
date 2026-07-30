import { readFileSync, existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, extname, basename, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { guardRead, MAX_READ_SIZE, resolvePatternWithinWorkspace, resolveWithinWorkspace, } from "./file-guards.js";
// ─── Constants ───────────────────────────────────────────
const MAX_FILE_LINES = 500;
const MAX_FOLDER_FILES = 10;
const MAX_FOLDER_LINES = 200;
const MAX_GLOB_FILES = 50;
const DEFAULT_BUDGET = 32000;
const BUDGET_WARNING_THRESHOLD = 0.85;
const IGNORE_DIRS = new Set(["node_modules", "dist", ".next", ".git", "build", "coverage", ".turbo", ".cache", "__pycache__"]);
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".rb", ".php", ".swift", ".kt"]);
// ─── Priority Map ────────────────────────────────────────
// Hoeher = wichtiger, wird zuletzt gekuerzt
const PRIORITY = {
    file: 10, git: 9, diff: 9, files: 8, folder: 7, url: 6, codebase: 5, tree: 4,
};
// ─── Workspace Boundary ─────────────────────────────────
function hasParentSegment(value) {
    return value.replaceAll("\\", "/").split("/").includes("..");
}
/**
 * Mention paths come from user text and project-local custom commands. Keep
 * them relative and workspace-bound before touching the filesystem.
 */
function resolveMentionTarget(target, cwd) {
    const trimmed = target.trim();
    if (!trimmed
        || trimmed.includes("\0")
        || isAbsolute(trimmed)
        || /^[A-Za-z]:[\\/]/.test(trimmed)
        || /^\\\\/.test(trimmed)
        || /^~(?:[\\/]|$)/.test(trimmed)
        || hasParentSegment(trimmed)) {
        return {
            ok: false,
            resolved: resolve(cwd, trimmed),
            reason: "Mention-Pfad muss relativ innerhalb des Arbeitsverzeichnisses liegen.",
        };
    }
    return resolveWithinWorkspace(trimmed, cwd);
}
function resolveMentionPattern(pattern, cwd) {
    const trimmed = pattern.trim();
    if (!trimmed
        || trimmed.includes("\0")
        || isAbsolute(trimmed)
        || /^[A-Za-z]:[\\/]/.test(trimmed)
        || /^\\\\/.test(trimmed)
        || /^~(?:[\\/]|$)/.test(trimmed)
        || hasParentSegment(trimmed)) {
        return {
            ok: false,
            resolved: resolve(cwd, trimmed),
            reason: "Mention-Muster muss relativ innerhalb des Arbeitsverzeichnisses liegen.",
        };
    }
    return resolvePatternWithinWorkspace(trimmed, cwd);
}
function workspaceRoot(cwd) {
    const checked = resolveWithinWorkspace(".", cwd);
    return checked.ok ? checked.resolved : null;
}
function safeWalkEntry(path, root) {
    try {
        // Recursive mention walkers never follow symlinks. Direct @file/@folder
        // references may follow an in-workspace symlink after boundary validation,
        // but a walker must not silently cross a link while enumerating.
        if (lstatSync(path).isSymbolicLink())
            return null;
        const checked = resolveWithinWorkspace(path, root);
        return checked.ok ? checked.resolved : null;
    }
    catch {
        return null;
    }
}
function readMentionFile(path) {
    try {
        const stat = statSync(path);
        if (!stat.isFile())
            return { error: "Kein regulaeres Textfile." };
        if (stat.size > MAX_READ_SIZE) {
            return { error: `Datei zu gross (${Math.round(stat.size / 1024 / 1024)} MB).` };
        }
        const raw = readFileSync(path);
        const readError = guardRead(raw.length, raw);
        if (readError)
            return { error: readError };
        return { content: raw.toString("utf-8") };
    }
    catch {
        return { error: "Datei konnte nicht gelesen werden." };
    }
}
// ─── Simple Glob Matching ────────────────────────────────
function globToRegex(pattern) {
    let re = "^";
    let i = 0;
    while (i < pattern.length) {
        const c = pattern[i];
        if (c === "*" && pattern[i + 1] === "*") {
            re += ".*";
            i += pattern[i + 2] === "/" ? 3 : 2;
        }
        else if (c === "*") {
            re += "[^/]*";
            i++;
        }
        else if (c === "?") {
            re += "[^/]";
            i++;
        }
        else if (c === "{") {
            const end = pattern.indexOf("}", i);
            if (end > i) {
                const opts = pattern.slice(i + 1, end).split(",").map(o => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
                re += `(?:${opts})`;
                i = end + 1;
            }
            else {
                re += "\\{";
                i++;
            }
        }
        else if (".+^${}()|[]\\".includes(c)) {
            re += "\\" + c;
            i++;
        }
        else {
            re += c;
            i++;
        }
    }
    return new RegExp(re + "$");
}
function globMatch(baseDir, pattern) {
    if (!resolveMentionPattern(pattern, baseDir).ok)
        return [];
    const root = workspaceRoot(baseDir);
    if (!root)
        return [];
    const regex = globToRegex(pattern);
    const results = [];
    const walk = (dir, depth) => {
        if (depth > 8 || results.length >= MAX_GLOB_FILES)
            return;
        try {
            for (const entry of readdirSync(dir)) {
                if (entry.startsWith(".") || IGNORE_DIRS.has(entry))
                    continue;
                const full = join(dir, entry);
                try {
                    const safePath = safeWalkEntry(full, root);
                    if (!safePath)
                        continue;
                    const stat = statSync(safePath);
                    if (stat.isDirectory())
                        walk(safePath, depth + 1);
                    else if (stat.isFile()) {
                        const rel = relative(root, safePath);
                        if (regex.test(rel))
                            results.push(safePath);
                    }
                }
                catch { }
            }
        }
        catch { }
    };
    walk(root, 0);
    return results;
}
// ─── Smart Chunking ──────────────────────────────────────
function smartChunk(content, maxLines) {
    const lines = content.split("\n");
    if (lines.length <= maxLines)
        return content;
    // Behalte Imports + exportierte Funktionen/Klassen
    const important = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^(import |export |\/\/ ─)/.test(line) || /^(export\s+)?(function|class|interface|type|const|enum)\s/.test(line)) {
            // Fuege Zeile + bis zu 3 Folgezeilen hinzu
            for (let j = i; j < Math.min(i + 4, lines.length); j++)
                important.push(j);
        }
    }
    const uniqueLines = [...new Set(important)].sort((a, b) => a - b).slice(0, maxLines);
    if (uniqueLines.length === 0) {
        return lines.slice(0, maxLines).join("\n") + `\n// ...(${lines.length - maxLines} Zeilen gekuerzt)`;
    }
    const result = [];
    let lastIdx = -2;
    for (const idx of uniqueLines) {
        if (idx - lastIdx > 1)
            result.push(`// ... (Zeile ${lastIdx + 2}-${idx} ausgelassen)`);
        result.push(lines[idx]);
        lastIdx = idx;
    }
    if (lastIdx < lines.length - 1)
        result.push(`// ... (${lines.length - lastIdx - 1} weitere Zeilen)`);
    return result.join("\n");
}
// ─── Directory Tree ──────────────────────────────────────
function buildTree(root, dir, prefix, depth, maxDepth) {
    if (depth >= maxDepth)
        return [];
    const lines = [];
    try {
        const entries = readdirSync(dir).filter(e => !e.startsWith(".") && !IGNORE_DIRS.has(e) && e !== ".DS_Store").sort();
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const isLast = i === entries.length - 1;
            const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
            const full = join(dir, entry);
            try {
                const safePath = safeWalkEntry(full, root);
                if (!safePath)
                    continue;
                const stat = statSync(safePath);
                if (stat.isDirectory()) {
                    lines.push(prefix + connector + entry + "/");
                    lines.push(...buildTree(root, safePath, prefix + (isLast ? "    " : "\u2502   "), depth + 1, maxDepth));
                }
                else {
                    lines.push(prefix + connector + entry);
                }
            }
            catch { }
        }
    }
    catch { }
    return lines;
}
// ─── Parse Mentions ──────────────────────────────────────
export function parseMentions(input, cwd) {
    const mentions = [];
    let cleanInput = input;
    // @file:path
    const fileRegex = /@file:(\S+)/g;
    let match;
    while ((match = fileRegex.exec(input)) !== null) {
        const filePath = match[1];
        cleanInput = cleanInput.replace(match[0], "");
        const checked = resolveMentionTarget(filePath, cwd);
        if (!checked.ok) {
            mentions.push({
                type: "file",
                source: filePath,
                content: `Zugriff blockiert: ${checked.reason}`,
                tokenEstimate: 20,
                priority: PRIORITY.file,
            });
            continue;
        }
        try {
            if (existsSync(checked.resolved)) {
                const read = readMentionFile(checked.resolved);
                if (read.content !== undefined) {
                    const content = read.content;
                    const chunked = smartChunk(content, MAX_FILE_LINES);
                    const header = `// Datei: ${filePath} (${content.split("\n").length} Zeilen)\n`;
                    const full = header + chunked;
                    mentions.push({ type: "file", source: filePath, content: full, tokenEstimate: Math.ceil(full.length / 4), priority: PRIORITY.file });
                }
                else {
                    mentions.push({ type: "file", source: filePath, content: `Fehler beim Lesen: ${filePath} (${read.error})`, tokenEstimate: 20, priority: PRIORITY.file });
                }
            }
            else {
                mentions.push({ type: "file", source: filePath, content: `Datei nicht gefunden: ${filePath}`, tokenEstimate: 10, priority: PRIORITY.file });
            }
        }
        catch {
            mentions.push({ type: "file", source: filePath, content: `Fehler beim Lesen: ${filePath}`, tokenEstimate: 10, priority: PRIORITY.file });
        }
    }
    // @files:glob
    const filesRegex = /@files:(\S+)/g;
    while ((match = filesRegex.exec(input)) !== null) {
        const pattern = match[1];
        cleanInput = cleanInput.replace(match[0], "");
        const patternCheck = resolveMentionPattern(pattern, cwd);
        if (!patternCheck.ok) {
            mentions.push({
                type: "files",
                source: pattern,
                content: `Zugriff blockiert: ${patternCheck.reason}`,
                tokenEstimate: 20,
                priority: PRIORITY.files,
            });
            continue;
        }
        const matched = globMatch(cwd, pattern);
        if (matched.length === 0) {
            mentions.push({ type: "files", source: pattern, content: `// Keine Dateien fuer Pattern: ${pattern}`, tokenEstimate: 10, priority: PRIORITY.files });
        }
        else {
            const perFileLines = matched.length > 20 ? 100 : 200;
            for (const abs of matched) {
                const root = workspaceRoot(cwd);
                if (!root)
                    continue;
                const rel = relative(root, abs);
                try {
                    const read = readMentionFile(abs);
                    if (read.content === undefined)
                        continue;
                    const content = read.content;
                    const chunked = smartChunk(content, perFileLines);
                    const header = `// ${rel} (${content.split("\n").length} Zeilen)\n`;
                    const full = header + chunked;
                    mentions.push({ type: "files", source: rel, content: full, tokenEstimate: Math.ceil(full.length / 4), priority: PRIORITY.files });
                }
                catch { }
            }
        }
    }
    // @diff:file
    const diffFileRegex = /@diff:(\S+)/g;
    while ((match = diffFileRegex.exec(input)) !== null) {
        const filePath = match[1];
        cleanInput = cleanInput.replace(match[0], "");
        try {
            const diff = execFileSync("git", ["-c", "core.fsmonitor=false", "diff", "--no-ext-diff", "--no-textconv", "--", filePath], { cwd, encoding: "utf-8", timeout: 5000 });
            const staged = execFileSync("git", ["-c", "core.fsmonitor=false", "diff", "--cached", "--no-ext-diff", "--no-textconv", "--", filePath], { cwd, encoding: "utf-8", timeout: 5000 });
            const combined = (diff + staged).trim();
            const content = combined || `(Keine Aenderungen in ${filePath})`;
            mentions.push({ type: "diff", source: filePath, content: `[Diff: ${filePath}]\n${content}`, tokenEstimate: Math.ceil(content.length / 4), priority: PRIORITY.diff });
        }
        catch (e) {
            mentions.push({ type: "diff", source: filePath, content: `Diff Fehler: ${e.message.slice(0, 100)}`, tokenEstimate: 10, priority: PRIORITY.diff });
        }
    }
    // @folder:path
    const folderRegex = /@folder:(\S+)/g;
    while ((match = folderRegex.exec(input)) !== null) {
        const folderPath = match[1];
        cleanInput = cleanInput.replace(match[0], "");
        const checked = resolveMentionTarget(folderPath, cwd);
        if (!checked.ok) {
            mentions.push({
                type: "folder",
                source: folderPath,
                content: `Zugriff blockiert: ${checked.reason}`,
                tokenEstimate: 20,
                priority: PRIORITY.folder,
            });
            continue;
        }
        try {
            if (existsSync(checked.resolved) && statSync(checked.resolved).isDirectory()) {
                const entries = readdirSync(checked.resolved).filter(e => !e.startsWith(".") && e !== "node_modules").slice(0, MAX_FOLDER_FILES);
                let content = `Ordner: ${folderPath}/\n`;
                for (const entry of entries) {
                    const full = join(checked.resolved, entry);
                    try {
                        const safePath = safeWalkEntry(full, workspaceRoot(cwd) ?? checked.resolved);
                        if (!safePath)
                            continue;
                        const stat = statSync(safePath);
                        if (stat.isFile() && stat.size < 100000) {
                            const read = readMentionFile(safePath);
                            if (read.content === undefined)
                                continue;
                            const fileContent = read.content;
                            const lines = fileContent.split("\n");
                            const truncated = lines.length > MAX_FOLDER_LINES ? lines.slice(0, MAX_FOLDER_LINES).join("\n") + `\n...(truncated)` : fileContent;
                            content += `\n--- ${entry} ---\n${truncated}\n`;
                        }
                        else if (stat.isDirectory()) {
                            content += `  ${entry}/\n`;
                        }
                    }
                    catch { }
                }
                mentions.push({ type: "folder", source: folderPath, content, tokenEstimate: Math.ceil(content.length / 4), priority: PRIORITY.folder });
            }
        }
        catch { }
    }
    // @git:diff, @git:log, @git:status, @git:staged
    const gitRegex = /@git:(\w+)/g;
    while ((match = gitRegex.exec(input)) !== null) {
        const subcmd = match[1];
        cleanInput = cleanInput.replace(match[0], "");
        try {
            let result = "";
            switch (subcmd) {
                case "diff":
                    result = execFileSync("git", ["-c", "core.fsmonitor=false", "diff", "--no-ext-diff", "--no-textconv"], { cwd, encoding: "utf-8", timeout: 5000 });
                    break;
                case "log":
                    result = execFileSync("git", ["-c", "core.fsmonitor=false", "log", "--oneline", "-15"], { cwd, encoding: "utf-8", timeout: 5000 });
                    break;
                case "status":
                    result = execFileSync("git", ["-c", "core.fsmonitor=false", "status"], { cwd, encoding: "utf-8", timeout: 5000 });
                    break;
                case "staged":
                    result = execFileSync("git", ["-c", "core.fsmonitor=false", "diff", "--staged", "--no-ext-diff", "--no-textconv"], { cwd, encoding: "utf-8", timeout: 5000 });
                    break;
                default: result = `Unbekannt: @git:${subcmd}`;
            }
            mentions.push({ type: "git", source: `git:${subcmd}`, content: result || "(leer)", tokenEstimate: Math.ceil((result || "").length / 4), priority: PRIORITY.git });
        }
        catch (e) {
            mentions.push({ type: "git", source: `git:${subcmd}`, content: `Git Fehler: ${e.message.slice(0, 100)}`, tokenEstimate: 10, priority: PRIORITY.git });
        }
    }
    // @url:https://...
    const urlRegex = /@url:(\S+)/g;
    while ((match = urlRegex.exec(input)) !== null) {
        cleanInput = cleanInput.replace(match[0], "");
        mentions.push({ type: "url", source: match[1], content: `[URL wird geladen: ${match[1]}]`, tokenEstimate: 50, priority: PRIORITY.url });
    }
    // @tree
    if (input.includes("@tree")) {
        cleanInput = cleanInput.replace(/@tree/g, "");
        const root = workspaceRoot(cwd);
        const name = basename(root ?? cwd);
        const treeLines = root ? [`${name}/`, ...buildTree(root, root, "", 0, 3)] : [`${name}/`];
        const content = treeLines.join("\n");
        mentions.push({ type: "tree", source: "tree", content, tokenEstimate: Math.ceil(content.length / 4), priority: PRIORITY.tree });
    }
    // @codebase
    if (input.includes("@codebase")) {
        cleanInput = cleanInput.replace(/@codebase/g, "");
        try {
            const root = workspaceRoot(cwd);
            const files = [];
            const walkDir = (dir, depth = 0) => {
                if (!root || depth > 4 || files.length > 100)
                    return;
                for (const entry of readdirSync(dir)) {
                    if (entry.startsWith(".") || IGNORE_DIRS.has(entry))
                        continue;
                    const full = join(dir, entry);
                    try {
                        const safePath = safeWalkEntry(full, root);
                        if (!safePath)
                            continue;
                        const stat = statSync(safePath);
                        if (stat.isDirectory())
                            walkDir(safePath, depth + 1);
                        else if (stat.isFile() && CODE_EXTS.has(extname(full))) {
                            const read = readMentionFile(safePath);
                            if (read.content === undefined)
                                continue;
                            const content = read.content;
                            const exports = [];
                            for (const line of content.split("\n")) {
                                const m = line.match(/export\s+(?:default\s+)?(?:function|class|interface|const|type)\s+(\w+)/);
                                if (m)
                                    exports.push(m[1]);
                            }
                            if (exports.length > 0)
                                files.push(`${relative(root, safePath)}: ${exports.join(", ")}`);
                        }
                    }
                    catch { }
                }
            };
            if (root)
                walkDir(root);
            const content = files.join("\n");
            mentions.push({ type: "codebase", source: "codebase", content: content || "(keine Exports gefunden)", tokenEstimate: Math.ceil(content.length / 4), priority: PRIORITY.codebase });
        }
        catch { }
    }
    return { cleanInput: cleanInput.trim(), mentions };
}
// ─── Context Budget ──────────────────────────────────────
export function getContextBudget(mentions, maxTokens = DEFAULT_BUDGET) {
    let usedTokens = mentions.reduce((sum, m) => sum + m.tokenEstimate, 0);
    const warnings = [];
    let wasTruncated = false;
    // Warnung bei hoher Auslastung
    if (usedTokens > maxTokens * BUDGET_WARNING_THRESHOLD && usedTokens <= maxTokens) {
        warnings.push(`Kontext-Budget bei ${Math.round((usedTokens / maxTokens) * 100)}% (${usedTokens}/${maxTokens} Tokens).`);
    }
    // Auto-Truncation bei Ueberschreitung
    if (usedTokens > maxTokens) {
        wasTruncated = true;
        warnings.push(`Kontext-Budget ueberschritten (${usedTokens}/${maxTokens} Tokens). Niedrigste Prioritaet wird gekuerzt.`);
        // Nach Prioritaet sortieren (aufsteigend — niedrigste zuerst kuerzen)
        const sorted = [...mentions].sort((a, b) => a.priority - b.priority);
        let excess = usedTokens - maxTokens;
        for (const mention of sorted) {
            if (excess <= 0)
                break;
            const orig = mention.tokenEstimate;
            if (orig <= excess) {
                mention.content = `// [Gekuerzt] ${mention.type}:${mention.source} (${orig} Tokens entfernt)`;
                mention.tokenEstimate = Math.ceil(mention.content.length / 4);
                excess -= orig - mention.tokenEstimate;
            }
            else {
                const targetChars = (orig - excess) * 4;
                const cut = mention.content.slice(0, targetChars);
                const lastNl = cut.lastIndexOf("\n");
                mention.content = (lastNl > 0 ? cut.slice(0, lastNl) : cut) + `\n// ... (${excess} Tokens gekuerzt)`;
                mention.tokenEstimate = Math.ceil(mention.content.length / 4);
                excess = 0;
            }
        }
        usedTokens = mentions.reduce((sum, m) => sum + m.tokenEstimate, 0);
    }
    return { maxTokens, usedTokens, remainingTokens: Math.max(0, maxTokens - usedTokens), mentionCount: mentions.length, warnings, wasTruncated };
}
// ─── Format ──────────────────────────────────────────────
export function formatMentionContext(mentions) {
    if (mentions.length === 0)
        return "";
    const parts = ["--- Kontext ---"];
    for (const m of mentions) {
        switch (m.type) {
            case "file":
            case "files":
                parts.push(`[Datei: ${m.source}]\n${m.content}`);
                break;
            case "folder":
                parts.push(m.content);
                break;
            case "git":
                parts.push(`[Git ${m.source}]\n${m.content}`);
                break;
            case "diff":
                parts.push(m.content);
                break;
            case "url":
                parts.push(`[URL: ${m.source}]\n${m.content}`);
                break;
            case "tree":
                parts.push(`[Verzeichnisbaum]\n${m.content}`);
                break;
            case "codebase":
                parts.push(`[Codebase Map]\n${m.content}`);
                break;
        }
    }
    parts.push("--- Ende Kontext ---");
    return parts.join("\n\n");
}
// ─── Autocomplete ────────────────────────────────────────
export function getMentionCompletions(partial, cwd) {
    const completions = [];
    if (partial.startsWith("@f")) {
        completions.push("@file:", "@files:", "@folder:");
        if (partial.startsWith("@file:") || partial.startsWith("@folder:")) {
            const prefix = partial.startsWith("@file:") ? "@file:" : "@folder:";
            const pathPart = partial.slice(prefix.length);
            const requestedDir = pathPart.includes("/")
                ? pathPart.replace(/[\\/][^\\/]*$/, "") || "."
                : ".";
            const checkedDir = resolveMentionTarget(requestedDir, cwd);
            if (!checkedDir.ok)
                return completions;
            const dir = checkedDir.resolved;
            try {
                for (const entry of readdirSync(dir).slice(0, 20)) {
                    if (entry.startsWith(".") || entry === "node_modules")
                        continue;
                    const full = join(dir, entry);
                    try {
                        const entryCheck = resolveWithinWorkspace(full, cwd);
                        if (!entryCheck.ok)
                            continue;
                        const rel = relative(workspaceRoot(cwd) ?? cwd, entryCheck.resolved);
                        if (statSync(entryCheck.resolved).isDirectory())
                            completions.push(`${prefix}${rel}/`);
                        else if (prefix === "@file:")
                            completions.push(`${prefix}${rel}`);
                    }
                    catch { }
                }
            }
            catch { }
        }
        if (partial.startsWith("@files:")) {
            completions.push("@files:src/**/*.ts", "@files:src/**/*.tsx", "@files:**/*.test.ts");
        }
    }
    if (partial.startsWith("@g"))
        completions.push("@git:diff", "@git:log", "@git:status", "@git:staged");
    if (partial.startsWith("@u"))
        completions.push("@url:");
    if (partial.startsWith("@c"))
        completions.push("@codebase");
    if (partial.startsWith("@d")) {
        completions.push("@diff:");
        if (partial.startsWith("@diff:")) {
            // Dateipfad-Completion
            const pathPart = partial.slice(6);
            const requestedDir = pathPart.includes("/")
                ? pathPart.replace(/[\\/][^\\/]*$/, "") || "."
                : ".";
            const checkedDir = resolveMentionTarget(requestedDir, cwd);
            if (!checkedDir.ok)
                return completions;
            const dir = checkedDir.resolved;
            try {
                for (const entry of readdirSync(dir).slice(0, 20)) {
                    if (entry.startsWith(".") || entry === "node_modules")
                        continue;
                    const full = join(dir, entry);
                    try {
                        const entryCheck = resolveWithinWorkspace(full, cwd);
                        if (!entryCheck.ok)
                            continue;
                        const rel = relative(workspaceRoot(cwd) ?? cwd, entryCheck.resolved);
                        if (statSync(entryCheck.resolved).isDirectory())
                            completions.push(`@diff:${rel}/`);
                        else
                            completions.push(`@diff:${rel}`);
                    }
                    catch { }
                }
            }
            catch { }
        }
    }
    if (partial.startsWith("@t"))
        completions.push("@tree");
    return completions;
}
//# sourceMappingURL=mentions.js.map