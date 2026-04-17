// ─── Rules System ────────────────────────────────────────
// Markdown-based rules with YAML frontmatter
// Loaded from ~/.morningstar/rules/*.md and .morningstar/rules/*.md
// Also treats MORNINGSTAR.md as a default rule
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
const GLOBAL_RULES_DIR = join(homedir(), ".morningstar", "rules");
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
function loadRulesFromFlatDir(dir, source, language) {
    const rules = [];
    if (!existsSync(dir))
        return rules;
    try {
        const files = readdirSync(dir).filter(f => f.endsWith(".md"));
        for (const file of files) {
            try {
                const filePath = join(dir, file);
                const raw = readFileSync(filePath, "utf-8");
                const { frontmatter, content } = parseFrontmatter(raw);
                const id = language ? `${language}/${basename(file, ".md")}` : basename(file, ".md");
                // Resolve @import directives
                const resolvedContent = resolveImports(content, dir, new Set([filePath]));
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
function loadRulesFromDir(dir, source, projectLanguage) {
    const rules = [];
    if (!existsSync(dir))
        return rules;
    // Load flat .md files (backward compatibility)
    rules.push(...loadRulesFromFlatDir(dir, source));
    // Load common/ subdirectory (always loaded)
    const commonDir = join(dir, "common");
    if (existsSync(commonDir)) {
        rules.push(...loadRulesFromFlatDir(commonDir, source, "common"));
    }
    // Load language-specific subdirectory if project language matches
    if (projectLanguage) {
        const langDir = LANGUAGE_DIR_MAP[projectLanguage] || projectLanguage.toLowerCase();
        const langPath = join(dir, langDir);
        if (existsSync(langPath)) {
            rules.push(...loadRulesFromFlatDir(langPath, source, langDir));
        }
    }
    // Also scan for any other subdirectories that have .md files
    // (supports custom language directories like rules/flutter/)
    try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
            if (entry === "common")
                continue; // Already loaded
            const entryPath = join(dir, entry);
            try {
                if (statSync(entryPath).isDirectory()) {
                    const langDir = LANGUAGE_DIR_MAP[projectLanguage || ""] || (projectLanguage || "").toLowerCase();
                    if (entry === langDir)
                        continue; // Already loaded
                    // Skip non-matching language dirs - only load if no project language or if explicitly requested
                    if (!projectLanguage) {
                        // No detected language: load all subdirectories
                        rules.push(...loadRulesFromFlatDir(entryPath, source, entry));
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
function resolveImports(content, baseDir, visited) {
    return content.replace(/@import\s+([^\n]+)/g, (_match, importPath) => {
        const trimmed = importPath.trim();
        const absPath = resolve(baseDir, trimmed);
        if (visited.has(absPath)) {
            return `<!-- Cycle detected: ${trimmed} -->`;
        }
        if (!existsSync(absPath)) {
            return `<!-- Import not found: ${trimmed} -->`;
        }
        try {
            visited.add(absPath);
            const imported = readFileSync(absPath, "utf-8");
            const { content: importedContent } = parseFrontmatter(imported);
            return resolveImports(importedContent, baseDir, visited);
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
    const globalRules = loadRulesFromDir(GLOBAL_RULES_DIR, "global", projectLanguage);
    const projectRules = loadRulesFromDir(projectDir, "project", projectLanguage);
    // Add MORNINGSTAR.md as a default rule if it exists
    const morningstarMd = join(cwd, "MORNINGSTAR.md");
    const defaultRules = [];
    if (existsSync(morningstarMd)) {
        try {
            const content = readFileSync(morningstarMd, "utf-8");
            defaultRules.push({
                id: "MORNINGSTAR",
                content,
                source: "project",
                filePath: morningstarMd,
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