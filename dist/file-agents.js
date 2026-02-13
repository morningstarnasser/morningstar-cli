// ─── File-Based Agents ───────────────────────────────────
// Markdown-based agent definitions with YAML frontmatter
// Loaded from ~/.morningstar/agents/*.md and .morningstar/agents/*.md
// Backwards compatible with agents.json
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
const GLOBAL_AGENTS_DIR = join(homedir(), ".morningstar", "agents");
function loadFileAgentsFromDir(dir, source) {
    const agents = {};
    if (!existsSync(dir))
        return agents;
    try {
        const files = readdirSync(dir).filter(f => f.endsWith(".md"));
        for (const file of files) {
            try {
                const filePath = join(dir, file);
                const raw = readFileSync(filePath, "utf-8");
                const { frontmatter, content } = parseFrontmatter(raw);
                const id = basename(file, ".md");
                agents[id] = {
                    id,
                    name: frontmatter.name || id,
                    description: frontmatter.description || "",
                    systemPrompt: content,
                    color: frontmatter.color || "#a855f7",
                    source,
                    filePath,
                    tools: frontmatter.tools,
                    preferredModel: frontmatter.preferredModel,
                    temperature: frontmatter.temperature,
                    maxTokens: frontmatter.maxTokens,
                };
            }
            catch { }
        }
    }
    catch { }
    return agents;
}
/**
 * Load all file-based agents (global + project).
 * Project agents override global ones with the same ID.
 */
export function loadFileAgents(cwd) {
    const projectDir = join(cwd, ".morningstar", "agents");
    const globalAgents = loadFileAgentsFromDir(GLOBAL_AGENTS_DIR, "global");
    const projectAgents = loadFileAgentsFromDir(projectDir, "project");
    return { ...globalAgents, ...projectAgents };
}
/**
 * Create a new agent as a .md file.
 */
export function createFileAgent(id, name, description, systemPrompt, options, cwd) {
    const dir = options?.global
        ? GLOBAL_AGENTS_DIR
        : join(cwd || process.cwd(), ".morningstar", "agents");
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${id}.md`);
    if (existsSync(filePath)) {
        return { success: false, error: `Agent "${id}" existiert bereits: ${filePath}` };
    }
    const frontmatter = {
        name,
        description,
        color: options?.color || "#a855f7",
    };
    if (options?.tools)
        frontmatter.tools = options.tools;
    if (options?.preferredModel)
        frontmatter.preferredModel = options.preferredModel;
    const fileContent = serializeFrontmatter(frontmatter, systemPrompt);
    writeFileSync(filePath, fileContent, "utf-8");
    return { success: true, filePath };
}
/**
 * Migrate agents.json entries to .md files.
 */
export function migrateAgentsJsonToMd(cwd) {
    const jsonFile = join(homedir(), ".morningstar", "agents.json");
    if (!existsSync(jsonFile))
        return { migrated: 0, errors: ["agents.json nicht gefunden."] };
    const errors = [];
    let migrated = 0;
    try {
        const raw = JSON.parse(readFileSync(jsonFile, "utf-8"));
        for (const [id, data] of Object.entries(raw)) {
            const a = data;
            if (!a || typeof a.name !== "string" || typeof a.systemPrompt !== "string")
                continue;
            const result = createFileAgent(id, a.name, a.description || "", a.systemPrompt, { color: a.color || "#a855f7", global: true });
            if (result.success) {
                migrated++;
            }
            else {
                errors.push(`${id}: ${result.error}`);
            }
        }
    }
    catch (e) {
        errors.push(`Parse-Fehler: ${e.message}`);
    }
    return { migrated, errors };
}
/**
 * Format file agents list for display.
 */
export function formatFileAgentsList(agents) {
    const entries = Object.entries(agents);
    if (entries.length === 0)
        return "  Keine File-Agents geladen.";
    return entries
        .map(([id, a]) => {
        const src = a.source === "global" ? "[global]" : "[project]";
        return `  /agent:${id.padEnd(15)} ${src} ${a.name} — ${a.description}`;
    })
        .join("\n");
}
//# sourceMappingURL=file-agents.js.map