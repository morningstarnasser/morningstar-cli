// ─── Rules System ────────────────────────────────────────
// Markdown-based rules with YAML frontmatter
// Loaded from ~/.morningstar/rules/*.md and .morningstar/rules/*.md
// Also treats MORNINGSTAR.md as a default rule
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
const GLOBAL_RULES_DIR = join(homedir(), ".morningstar", "rules");
function loadRulesFromDir(dir, source) {
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
                const id = basename(file, ".md");
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
                });
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
 */
export function loadRules(cwd) {
    const projectDir = join(cwd, ".morningstar", "rules");
    const globalRules = loadRulesFromDir(GLOBAL_RULES_DIR, "global");
    const projectRules = loadRulesFromDir(projectDir, "project");
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