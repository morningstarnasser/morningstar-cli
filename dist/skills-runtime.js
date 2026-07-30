// ─── Local Skill Runtime (#4) ────────────────────────────────────────────────
// Jerry's review: give Carry a lazy, capability-aware skill system — index /
// search / load on demand, never dump 189 skills into the system prompt, and
// never auto-execute a skill's scripts. A skill is a *procedure* (SKILL.md) the
// agent reads and then carries out with its normal tools. Local skills live in
// ~/.morningstar/skills/<...>/SKILL.md. For everything Carry doesn't have
// locally, it delegates to Jerry (the bridge).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
const SKILLS_DIR = join(homedir(), ".morningstar", "skills");
/**
 * Parse a SKILL.md's frontmatter/heading into name + description + requirements.
 * Pure + testable. `name` is supplied by the caller (the relative path).
 */
export function parseSkillMeta(content, name) {
    let description = "";
    let requires = [];
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (fm) {
        const desc = fm[1].match(/^description:\s*(.+)$/m);
        if (desc)
            description = desc[1].trim().replace(/^["']|["']$/g, "");
        const req = fm[1].match(/^requires:\s*(.+)$/m);
        if (req)
            requires = req[1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    }
    if (!description) {
        const firstText = content.replace(/^---\n[\s\S]*?\n---/, "").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
        description = firstText ? firstText.slice(0, 160) : "(keine Beschreibung)";
    }
    return { name, description, requires };
}
/** True if every required command resolves on PATH. */
export function checkReadiness(requires, exists) {
    return requires.every((cmd) => exists(cmd));
}
function findSkillFiles(dir) {
    const out = [];
    const walk = (d, depth) => {
        if (depth > 4 || !existsSync(d))
            return;
        for (const entry of readdirSync(d)) {
            if (entry.startsWith(".") || entry === "node_modules")
                continue;
            const p = join(d, entry);
            try {
                if (statSync(p).isDirectory())
                    walk(p, depth + 1);
                else if (entry === "SKILL.md")
                    out.push(p);
            }
            catch {
                /* skip */
            }
        }
    };
    walk(dir, 0);
    return out;
}
/** List local skills (name = path relative to the skills dir). */
export function listSkills(dir = SKILLS_DIR) {
    return findSkillFiles(dir).map((file) => {
        const name = relative(dir, file).replace(/\/SKILL\.md$/, "");
        try {
            return parseSkillMeta(readFileSync(file, "utf-8"), name);
        }
        catch {
            return { name, description: "(unlesbar)", requires: [] };
        }
    });
}
/** Keyword search over name + description. Pure given the skill list. */
export function searchSkills(query, skills) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0)
        return skills;
    return skills.filter((s) => {
        const hay = `${s.name} ${s.description}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
    });
}
/** Load a skill's full procedure text, or null if not found. */
export function loadSkill(name, dir = SKILLS_DIR) {
    const file = join(dir, name, "SKILL.md");
    if (!existsSync(file))
        return null;
    try {
        return readFileSync(file, "utf-8");
    }
    catch {
        return null;
    }
}
/**
 * Handle a `<tool:skill>...</tool>` argument: "list", "search <q>", "load <name>".
 * Returns text for the agent. Delegating side effects stay with the agent.
 */
export function runSkillCommand(arg) {
    const [sub, ...rest] = arg.trim().split(/\s+/);
    const tail = rest.join(" ").trim();
    switch ((sub || "list").toLowerCase()) {
        case "":
        case "list": {
            const skills = listSkills();
            if (skills.length === 0)
                return "Keine lokalen Skills in ~/.morningstar/skills/. Für externe Fähigkeiten <tool:jerry> nutzen.";
            return skills.map((s) => `• ${s.name} — ${s.description}`).join("\n");
        }
        case "search": {
            const hits = searchSkills(tail, listSkills());
            return hits.length ? hits.map((s) => `• ${s.name} — ${s.description}`).join("\n") : `Kein lokaler Skill für "${tail}". Evtl. <tool:jerry>.`;
        }
        case "load": {
            const skill = loadSkill(tail);
            return skill ?? `Kein Skill "${tail}". <tool:skill>list</tool> zeigt verfügbare.`;
        }
        default:
            return "Nutzung: <tool:skill>list</tool> · search <q> · load <name>";
    }
}
export const SKILLS_PATH = SKILLS_DIR;
//# sourceMappingURL=skills-runtime.js.map