import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
const canonicalPath = realpathSync.native;
const MAX_FILE = 256 * 1024;
const cache = new Map();
function directories(path) {
    try {
        return readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    }
    catch {
        return [];
    }
}
export function defaultSkillRoots(cwd, home = homedir()) {
    const roots = [
        { path: join(cwd, ".morningstar/skills"), label: "project", trusted: false, flat: true },
        { path: join(home, ".morningstar/skills"), label: "morningstar", trusted: true, flat: true },
        { path: join(home, ".agents/skills"), label: "agents", trusted: true },
        { path: join(home, ".claude/skills"), label: "claude", trusted: true },
        { path: join(home, ".codex/skills"), label: "codex", trusted: true },
        { path: join(home, ".codex/skills/.system"), label: "codex-system", trusted: true },
        { path: join(home, ".kimi/skills"), label: "kimi", trusted: true },
        { path: join(home, ".kimi-code/skills"), label: "kimi-code", trusted: true },
        { path: join(home, ".pi/agent/skills"), label: "pi", trusted: true },
        { path: join(home, ".qwen/skills"), label: "qwen", trusted: true },
        { path: join(home, ".gemini/skills"), label: "gemini", trusted: true },
    ];
    // Read installed local package content; never install or execute a plugin.
    for (const client of ["codex", "claude"]) {
        const base = join(home, `.${client}/plugins/cache`);
        for (const market of directories(base))
            for (const plugin of directories(join(base, market))) {
                const parent = join(base, market, plugin);
                const versions = directories(parent).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
                const latest = versions[0];
                if (latest)
                    roots.push({ path: join(parent, latest, "skills"), label: `${client}-plugin-${plugin}`, trusted: true });
            }
    }
    return roots;
}
function inside(path, root) {
    const rel = relative(root, path);
    return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep));
}
/** The final file is opened without following a substituted symlink. */
function readRegular(path, headerOnly = false) {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > MAX_FILE)
            throw new Error("Skill file exceeds 256 KiB or is not regular");
        const data = Buffer.alloc(Math.min(stat.size, headerOnly ? 16384 : MAX_FILE));
        const length = readSync(fd, data, 0, data.length, 0);
        // Markdown security examples can contain a literal NUL. Validate UTF-8
        // instead of treating that character alone as proof of a binary file.
        return new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(0, length), { stream: headerOnly });
    }
    finally {
        closeSync(fd);
    }
}
function strings(value) { return Array.isArray(value) ? value.filter((s) => typeof s === "string") : []; }
function metadata(raw) {
    const { frontmatter: fm, content } = parseFrontmatter(raw);
    let description = typeof fm.description === "string" ? fm.description : "";
    if ([">", "|", ">-", "|-"].includes(description)) {
        const match = raw.match(/^description:\s*[>|]-?\s*\r?\n((?:[ \t]+[^\r\n]*\r?\n)+)/m);
        description = match ? match[1].split(/\r?\n/).map((s) => s.trim()).join(" ") : "";
    }
    description ||= content.split(/\r?\n/).find((s) => s.trim() && !s.startsWith("#"))?.trim() ?? "Keine Beschreibung";
    return { name: typeof fm.name === "string" ? fm.name.slice(0, 150) : undefined, description: description.slice(0, 600), triggers: strings(fm.triggers), requires: typeof fm.requires === "string" ? fm.requires.split(/[,\s]+/).filter(Boolean) : strings(fm.requires) };
}
export function discoverSkills(cwd, options = {}) {
    // Check the cache before walking plugin marketplaces to reconstruct roots.
    // Include the workspace: custom untrusted roots must not cross cache scopes.
    const key = JSON.stringify([resolve(cwd), homedir(), options.roots ?? null]);
    const cached = cache.get(key);
    if (!options.fresh && cached && Date.now() - cached.at < 5000)
        return cached.value;
    const roots = options.roots ?? defaultSkillRoots(cwd);
    let workspace;
    try {
        workspace = canonicalPath(cwd);
    }
    catch { /* missing project; global roots still work */ }
    const skills = [], warnings = [];
    const seenFiles = new Set(), ids = new Set();
    for (const root of roots) {
        const seenDirs = new Set();
        let visited = 0;
        const walk = (path, depth) => {
            if (depth > 8 || ++visited > 10000) {
                if (warnings.length < 20)
                    warnings.push(`Scan limit: ${root.label}`);
                return;
            }
            try {
                const stat = lstatSync(path);
                if (!root.trusted && stat.isSymbolicLink())
                    return;
                const canonical = canonicalPath(path);
                if (!root.trusted) {
                    if (!workspace || !inside(canonical, workspace) || canonical !== resolve(workspace, relative(resolve(cwd), resolve(path))))
                        return;
                }
                const realStat = lstatSync(canonical);
                if (realStat.isDirectory()) {
                    if (seenDirs.has(canonical))
                        return;
                    seenDirs.add(canonical);
                    const entries = readdirSync(canonical).sort();
                    if (entries.includes("SKILL.md")) {
                        walk(join(path, "SKILL.md"), depth + 1);
                        return;
                    }
                    for (const entry of entries) {
                        if (entry.startsWith(".") || ["node_modules", "references", "scripts", "assets", "tests"].includes(entry))
                            continue;
                        walk(join(path, entry), depth + 1);
                    }
                }
                else if (realStat.isFile() && (basename(path) === "SKILL.md" || (root.flat && depth === 1 && path.endsWith(".md")))) {
                    if (seenFiles.has(canonical))
                        return;
                    const raw = readRegular(canonical, true);
                    const meta = metadata(raw);
                    const rel = relative(root.path, path).split(sep).join("/");
                    const baseId = rel === "SKILL.md" ? basename(root.path) : rel.replace(/\/SKILL\.md$/, "").replace(/\.md$/, "");
                    let id = baseId;
                    if (ids.has(id))
                        id = `${root.label}/${baseId}`;
                    if (ids.has(id))
                        return;
                    ids.add(id);
                    seenFiles.add(canonical);
                    skills.push({ id, name: meta.name || baseId, description: meta.description, triggers: meta.triggers, requires: meta.requires, filePath: canonical, baseDir: dirname(canonical), source: root.trusted ? "global" : "project", origin: root.label });
                }
            }
            catch { /* missing roots and unsafe/unreadable files are not capabilities */ }
        };
        walk(root.path, 0);
    }
    const value = { skills, roots, warnings: [...new Set(warnings)] };
    if (cache.size > 32)
        cache.clear();
    cache.set(key, { at: Date.now(), value });
    return value;
}
export function readCatalogSkill(skill) {
    // Index entries are rechecked because files may change between search and load.
    if (canonicalPath(skill.filePath) !== skill.filePath)
        throw new Error("Skill path changed after discovery");
    return readRegular(skill.filePath);
}
export function readSkillResource(skill, resource) {
    const path = resolve(skill.baseDir, resource);
    if (!inside(path, skill.baseDir))
        throw new Error("Resource must stay inside the skill package");
    const actual = canonicalPath(path);
    if (!inside(actual, skill.baseDir))
        throw new Error("Resource symlink escapes the skill package");
    return readRegular(actual);
}
//# sourceMappingURL=skill-catalog.js.map