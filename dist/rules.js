// ─── Rules System ────────────────────────────────────────
// Markdown-based rules with YAML frontmatter
// Loaded from ~/.morningstar/rules/*.md and .morningstar/rules/*.md
// Also treats MORNINGSTAR.md as a default rule
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { resolveWithinWorkspace } from "./file-guards.js";
const GLOBAL_RULES_DIR = join(homedir(), ".morningstar", "rules");
function safeDirectory(dir, boundaryRoot) {
    try {
        if (!existsSync(dir))
            return null;
        const lexicalStat = lstatSync(dir);
        if (!lexicalStat.isDirectory() || lexicalStat.isSymbolicLink())
            return null;
        const checked = resolveWithinWorkspace(dir, boundaryRoot);
        if (!checked.ok)
            return null;
        const resolvedStat = lstatSync(checked.resolved);
        return resolvedStat.isDirectory() && !resolvedStat.isSymbolicLink()
            ? checked.resolved
            : null;
    }
    catch {
        return null;
    }
}
function safeRuleFile(filePath, boundaryRoot) {
    try {
        const lexicalStat = lstatSync(filePath);
        if (!lexicalStat.isFile() || lexicalStat.isSymbolicLink())
            return null;
        const checked = resolveWithinWorkspace(filePath, boundaryRoot);
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
function unsafeImportPath(importPath) {
    const normalized = importPath.replaceAll("\\", "/");
    return (!importPath
        || importPath.includes("\0")
        || isAbsolute(importPath)
        || /^[A-Za-z]:[\\/]/.test(importPath)
        || /^\\\\/.test(importPath)
        || /^~(?:[\\/]|$)/.test(importPath)
        || normalized.split("/").includes(".."));
}
// Map detected project languages to rule directory names
const LANGUAGE_DIR_MAP = {
    "TypeScript/JavaScript": "typescript",
    "TypeScript": "typescript",
    "JavaScript": "typescript",
    "Python": "python",
    "Go": "golang",
    "Rust": "rust",
    "Java": "java",
    "Kotlin": "kotlin",
    "C++": "cpp",
    "C#": "csharp",
    "PHP": "php",
    "Swift": "swift",
    "Perl": "perl",
};
function loadRulesFromFlatDir(dir, source, boundaryRoot, language) {
    const rules = [];
    const safeDir = safeDirectory(dir, boundaryRoot);
    if (!safeDir)
        return rules;
    try {
        const files = readdirSync(safeDir, { withFileTypes: true })
            .filter(entry => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".md"));
        for (const file of files) {
            try {
                const filePath = safeRuleFile(join(safeDir, file.name), boundaryRoot);
                if (!filePath)
                    continue;
                const raw = readFileSync(filePath, "utf-8");
                const { frontmatter, content } = parseFrontmatter(raw);
                const id = language ? `${language}/${basename(file.name, ".md")}` : basename(file.name, ".md");
                // Resolve @import directives
                const resolvedContent = resolveImports(content, safeDir, boundaryRoot, new Set([filePath]));
                rules.push({
                    id,
                    content: resolvedContent,
                    source,
                    filePath,
                    pathPattern: frontmatter.pathPattern,
                    priority: frontmatter.priority ?? 0,
                    description: frontmatter.description || "",
                    language: language || frontmatter.language,
                });
            }
            catch { }
        }
    }
    catch { }
    return rules;
}
/**
 * Load rules from a directory, supporting subdirectory structure:
 *   rules/common/     -> always loaded
 *   rules/typescript/  -> loaded when project language matches
 *   rules/*.md         -> flat files, always loaded (backward compat)
 */
function loadRulesFromDir(dir, source, boundaryRoot, projectLanguage) {
    const rules = [];
    const safeRoot = safeDirectory(dir, boundaryRoot);
    if (!safeRoot)
        return rules;
    // Load flat .md files (backward compatibility)
    rules.push(...loadRulesFromFlatDir(safeRoot, source, boundaryRoot));
    // Load common/ subdirectory (always loaded)
    const commonDir = join(safeRoot, "common");
    if (safeDirectory(commonDir, boundaryRoot)) {
        rules.push(...loadRulesFromFlatDir(commonDir, source, boundaryRoot, "common"));
    }
    // Load language-specific subdirectory if project language matches
    if (projectLanguage) {
        const langDir = LANGUAGE_DIR_MAP[projectLanguage] || projectLanguage.toLowerCase();
        const langPath = join(safeRoot, langDir);
        if (safeDirectory(langPath, boundaryRoot)) {
            rules.push(...loadRulesFromFlatDir(langPath, source, boundaryRoot, langDir));
        }
    }
    // Also scan for any other subdirectories that have .md files
    // (supports custom language directories like rules/flutter/)
    try {
        const entries = readdirSync(safeRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === "common" || entry.isSymbolicLink() || !entry.isDirectory())
                continue;
            const entryPath = join(safeRoot, entry.name);
            try {
                if (safeDirectory(entryPath, boundaryRoot)) {
                    const langDir = LANGUAGE_DIR_MAP[projectLanguage || ""] || (projectLanguage || "").toLowerCase();
                    if (entry.name === langDir)
                        continue; // Already loaded
                    // Skip non-matching language dirs - only load if no project language or if explicitly requested
                    if (!projectLanguage) {
                        // No detected language: load all subdirectories
                        rules.push(...loadRulesFromFlatDir(entryPath, source, boundaryRoot, entry.name));
                    }
                }
            }
            catch { }
        }
    }
    catch { }
    return rules;
}
/**
 * Resolve @import directives recursively with cycle detection.
 */
function resolveImports(content, baseDir, boundaryRoot, visited) {
    return content.replace(/@import\s+([^\n]+)/g, (_match, importPath) => {
        const trimmed = importPath.trim();
        if (unsafeImportPath(trimmed)) {
            return `<!-- Import blocked: ${trimmed} -->`;
        }
        const absPath = safeRuleFile(resolve(baseDir, trimmed), boundaryRoot);
        if (!absPath) {
            return `<!-- Import blocked or not found: ${trimmed} -->`;
        }
        if (visited.has(absPath)) {
            return `<!-- Cycle detected: ${trimmed} -->`;
        }
        try {
            visited.add(absPath);
            const imported = readFileSync(absPath, "utf-8");
            const { content: importedContent } = parseFrontmatter(imported);
            return resolveImports(importedContent, dirname(absPath), boundaryRoot, visited);
        }
        catch {
            return `<!-- Import error: ${trimmed} -->`;
        }
    });
}
/**
 * Load all rules (global + project + MORNINGSTAR.md).
 * Optionally filter by detected project language.
 */
export function loadRules(cwd, projectLanguage) {
    const projectDir = join(cwd, ".morningstar", "rules");
    const globalRules = loadRulesFromDir(GLOBAL_RULES_DIR, "global", GLOBAL_RULES_DIR, projectLanguage);
    const projectRules = loadRulesFromDir(projectDir, "project", cwd, projectLanguage);
    // Add MORNINGSTAR.md as a default rule if it exists
    const morningstarMd = join(cwd, "MORNINGSTAR.md");
    const defaultRules = [];
    const safeMorningstarMd = safeRuleFile(morningstarMd, cwd);
    if (safeMorningstarMd) {
        try {
            const content = readFileSync(safeMorningstarMd, "utf-8");
            defaultRules.push({
                id: "MORNINGSTAR",
                content,
                source: "project",
                filePath: safeMorningstarMd,
                priority: -1, // Lowest priority — other rules override
                description: "Project default rules (MORNINGSTAR.md)",
            });
        }
        catch { }
    }
    // Merge: global first, then project, then MORNINGSTAR.md
    const all = [...defaultRules, ...globalRules, ...projectRules];
    // Sort by priority (higher = more important, applied later)
    all.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    return all;
}
/**
 * Get rules applicable to a specific file path.
 */
export function getApplicableRules(cwd, filePath) {
    const rules = loadRules(cwd);
    if (!filePath)
        return rules;
    return rules.filter(rule => {
        if (!rule.pathPattern)
            return true;
        try {
            // Simple glob matching
            const pattern = rule.pathPattern
                .replace(/\*\*/g, ".*")
                .replace(/\*/g, "[^/]*")
                .replace(/\?/g, ".");
            const regex = new RegExp(pattern);
            return regex.test(filePath);
        }
        catch {
            return true;
        }
    });
}
/**
 * Create a new rule file.
 */
export function createRule(id, content, options, cwd) {
    const dir = options?.global
        ? GLOBAL_RULES_DIR
        : join(cwd || process.cwd(), ".morningstar", "rules");
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${id}.md`);
    if (existsSync(filePath)) {
        return { success: false, error: `Rule "${id}" existiert bereits: ${filePath}` };
    }
    const frontmatter = {};
    if (options?.description)
        frontmatter.description = options.description;
    if (options?.pathPattern)
        frontmatter.pathPattern = options.pathPattern;
    if (options?.priority !== undefined)
        frontmatter.priority = options.priority;
    const fileContent = serializeFrontmatter(frontmatter, content);
    writeFileSync(filePath, fileContent, "utf-8");
    return { success: true, filePath };
}
/**
 * Build rules prompt addition for system prompt.
 */
export function buildRulesPrompt(cwd) {
    const rules = loadRules(cwd);
    if (rules.length === 0)
        return "";
    const parts = ["\n\n--- Project Rules ---"];
    for (const rule of rules) {
        if (rule.id === "MORNINGSTAR")
            continue; // Already injected via project memory
        parts.push(`\n[Rule: ${rule.id}${rule.description ? ` — ${rule.description}` : ""}]`);
        parts.push(rule.content);
    }
    parts.push("--- Ende Rules ---");
    return parts.join("\n");
}
/**
 * Format rules list for display.
 */
export function formatRulesList(rules) {
    if (rules.length === 0)
        return "  Keine Rules geladen.";
    return rules
        .map(r => {
        const src = r.source === "global" ? "[global]" : "[project]";
        const path = r.pathPattern ? ` path: ${r.pathPattern}` : "";
        const prio = r.priority ? ` prio: ${r.priority}` : "";
        return `  ${r.id.padEnd(20)} ${src} ${r.description || "(no description)"}${path}${prio}`;
    })
        .join("\n");
}
//# sourceMappingURL=rules.js.map