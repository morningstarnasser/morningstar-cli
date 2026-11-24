import { discoverSkills, readCatalogSkill } from "./skill-catalog.js";
// ─── Skills System ───────────────────────────────────────
// Markdown-based skills with YAML frontmatter
// Shared catalog across local skill packages; content loaded on selection.
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
const GLOBAL_SKILLS_DIR = join(homedir(), ".morningstar", "skills");
function catalogSkill(entry, full = false) {
    const parsed = full ? parseFrontmatter(readCatalogSkill(entry)) : undefined;
    const fm = parsed?.frontmatter;
    const array = (value) => Array.isArray(value) ? value.filter((v) => typeof v === "string") : undefined;
    return { tools: array(fm?.tools), tags: array(fm?.tags), agent: typeof fm?.agent === "string" ? fm.agent : undefined,
        version: typeof fm?.version === "string" ? fm.version : undefined, id: entry.id, name: entry.name, description: entry.description, triggers: entry.triggers,
        source: entry.source, filePath: entry.filePath, origin: entry.origin,
        content: parsed?.content ?? "" };
}
/** Metadata only; procedure text is loaded on explicit selection. */
export function loadSkills(cwd) {
    return discoverSkills(cwd).skills.map((entry) => catalogSkill(entry));
}
export function getSkill(id, cwd) {
    const entry = discoverSkills(cwd).skills.find((skill) => skill.id === id);
    if (!entry)
        return null;
    try {
        return catalogSkill(entry, true);
    }
    catch {
        return null;
    }
}
/**
 * Match a skill by trigger patterns against user input.
 * Returns the first matching skill or null.
 */
export function matchSkillByTrigger(input, cwd) {
    const skills = loadSkills(cwd);
    const lower = input.toLowerCase();
    for (const skill of skills) {
        if (!skill.triggers || skill.triggers.length === 0)
            continue;
        for (const trigger of skill.triggers) {
            try {
                if (trigger.startsWith("/") && trigger.endsWith("/")) {
                    // Regex trigger
                    const regex = new RegExp(trigger.slice(1, -1), "i");
                    if (regex.test(input))
                        return getSkill(skill.id, cwd);
                }
                else {
                    // String match trigger
                    if (lower.includes(trigger.toLowerCase()))
                        return getSkill(skill.id, cwd);
                }
            }
            catch { }
        }
    }
    return null;
}
/**
 * Create a new skill file.
 */
export function createSkill(id, name, description, content, options, cwd) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id))
        return { success: false, error: "Ungültige Skill-ID" };
    const dir = options?.global
        ? GLOBAL_SKILLS_DIR
        : join(cwd || process.cwd(), ".morningstar", "skills");
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${id}.md`);
    if (existsSync(filePath)) {
        return { success: false, error: `Skill "${id}" existiert bereits: ${filePath}` };
    }
    const frontmatter = { name, description };
    if (options?.triggers)
        frontmatter.triggers = options.triggers;
    if (options?.tools)
        frontmatter.tools = options.tools;
    if (options?.agent)
        frontmatter.agent = options.agent;
    if (options?.tags)
        frontmatter.tags = options.tags;
    const fileContent = serializeFrontmatter(frontmatter, content);
    writeFileSync(filePath, fileContent, "utf-8");
    return { success: true, filePath };
}
/**
 * Format skill list for display.
 */
export function formatSkillsList(skills) {
    if (skills.length === 0)
        return "  Keine Skills geladen.";
    return skills
        .map(s => {
        const src = s.source === "global" ? "[global]" : "[project]";
        const triggers = s.triggers ? ` triggers: ${s.triggers.join(", ")}` : "";
        return `  /skill:${s.id.padEnd(15)} ${src} ${s.name} — ${s.description}${triggers}`;
    })
        .join("\n");
}
/**
 * Get the prompt addition for an active skill.
 */
export function getSkillPromptAddition(skill) {
    if (!skill)
        return "";
    let addition = `\n\n--- Active Skill: ${skill.name} ---\n`;
    addition += `Quelle: ${skill.filePath}\nRelative Referenzen und Skripte gehören zu diesem Skill-Verzeichnis.\n`;
    addition += skill.content.slice(0, 12000);
    if (skill.content.length > 12000)
        addition += `\nWeiterlesen mit skill load ${skill.id} 12000.`;
    if (skill.tools && skill.tools.length > 0) {
        addition += `\n\nIm Skill beschriebene Tools (Berechtigungsprüfung bleibt gültig): ${skill.tools.join(", ")}`;
    }
    addition += `\n--- Ende Skill ---`;
    return addition;
}
//# sourceMappingURL=skills.js.map