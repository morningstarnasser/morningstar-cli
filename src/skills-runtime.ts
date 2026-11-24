// Shared lazy skill runtime. Reading a procedure never executes its scripts.

import { homedir } from "node:os";
import { join } from "node:path";
import { discoverSkills, readCatalogSkill, readSkillResource, type SkillRoot } from "./skill-catalog.js";

const SKILLS_DIR = join(homedir(), ".morningstar", "skills");

export interface SkillMeta {
  name: string;
  description: string;
  /** Commands/env the skill needs (from a `requires:` frontmatter line). */
  requires: string[];
}

/**
 * Parse a SKILL.md's frontmatter/heading into name + description + requirements.
 * Pure + testable. `name` is supplied by the caller (the relative path).
 */
export function parseSkillMeta(content: string, name: string): SkillMeta {
  let description = "";
  let requires: string[] = [];

  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const desc = fm[1].match(/^description:\s*(.+)$/m);
    if (desc) description = desc[1].trim().replace(/^["']|["']$/g, "");
    const req = fm[1].match(/^requires:\s*(.+)$/m);
    if (req) requires = req[1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (!description) {
    const firstText = content.replace(/^---\n[\s\S]*?\n---/, "").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    description = firstText ? firstText.slice(0, 160) : "(keine Beschreibung)";
  }
  return { name, description, requires };
}

/** True if every required command resolves on PATH. */
export function checkReadiness(requires: string[], exists: (cmd: string) => boolean): boolean {
  return requires.every((cmd) => exists(cmd));
}

/** List local skills (name = path relative to the skills dir). */
export function listSkills(dir?: string): SkillMeta[] {
  return discoverSkills(dir ?? process.cwd(), dir ? { roots: [{ path: dir, label: "local", trusted: false }] } : {}).skills
    .map((skill) => ({ name: skill.id, description: skill.description, requires: skill.requires }));
}

/** Keyword search over name + description. Pure given the skill list. */
export function searchSkills(query: string, skills: SkillMeta[]): SkillMeta[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return skills;
  return skills.filter((s) => {
    const hay = `${s.name} ${s.description}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Load a skill's full procedure text, or null if not found. */
export function loadSkill(name: string, dir?: string): string | null {
  const skill = discoverSkills(dir ?? process.cwd(), dir ? { roots: [{ path: dir, label: "local", trusted: false }] } : {}).skills.find((s) => s.id === name);
  try { return skill ? readCatalogSkill(skill) : null; } catch { return null; }
}

/**
 * Handle a `<tool:skill>...</tool>` argument: "list", "search <q>", "load <name>".
 * Returns text for the agent. Delegating side effects stay with the agent.
 */
export function runSkillCommand(arg: string, cwd = process.cwd(), roots?: SkillRoot[]): string {
  const [sub, ...rest] = arg.trim().split(/\s+/);
  const tail = rest.join(" ").trim();
  const catalog = discoverSkills(cwd, { roots });
  const pageSize = 30;
  const format = (items: typeof catalog.skills, page = 1) => {
    const from = (page - 1) * pageSize;
    return [`Skills: ${items.length} · Seite ${page}/${Math.max(1, Math.ceil(items.length / pageSize))}`,
      ...items.slice(from, from + pageSize).map((s) => `${s.id} — ${s.description.slice(0, 220)}`),
      `Laden: skill load <id> [offset] · Referenzen: skill read <id> <relativer-pfad> [offset]`,
      ...catalog.warnings].join("\n").slice(0, 12000);
  };
  switch ((sub || "list").toLowerCase()) {
    case "":
    case "list": {
      const page = tail ? Number(tail) : 1;
      if (!Number.isSafeInteger(page) || page < 1) return "Skill-Fehler: Seite muss eine positive Ganzzahl sein.";
      return format(catalog.skills, page);
    }
    case "search": {
      const pageMatch = tail.match(/(?:^|\s)--page\s+(\d+)$/);
      const page = pageMatch ? Number(pageMatch[1]) : 1;
      if (!Number.isSafeInteger(page) || page < 1) return "Skill-Fehler: Seite muss positiv sein.";
      const terms = (pageMatch ? tail.slice(0, pageMatch.index) : tail).toLowerCase().split(/\s+/).filter(Boolean);
      const hits = catalog.skills.filter((s) => terms.every((term) => `${s.id} ${s.name} ${s.description}`.toLowerCase().includes(term)));
      return hits.length ? format(hits, page) : `Kein passender Skill. Suche mit einem kürzeren Stichwort; skill list zeigt den Katalog.`;
    }
    case "load": {
      const skill = catalog.skills.find((s) => s.id === rest[0]);
      const offset = rest[1] === undefined ? 0 : Number(rest[1]);
      if (!skill || !Number.isSafeInteger(offset) || offset < 0) return "Skill-Fehler: Skill oder Offset ungültig.";
      try {
        const raw = readCatalogSkill(skill);
        return `Skill: ${skill.id}\nQuelle: ${skill.filePath}\nPaket: ${skill.baseDir}\nZeichen ${offset}–${Math.min(offset + 10000, raw.length)} von ${raw.length}.\n${raw.slice(offset, offset + 10000)}${offset + 10000 < raw.length ? `\nWeiter: skill load ${skill.id} ${offset + 10000}` : ""}`;
      } catch { return "Skill-Fehler: Datei ist nicht mehr sicher lesbar."; }
    }
    case "read": {
      const skill = catalog.skills.find((s) => s.id === rest[0]);
      const offset = rest[2] === undefined ? 0 : Number(rest[2]);
      if (!skill || !rest[1] || !Number.isSafeInteger(offset) || offset < 0) return "Skill-Fehler: Ressource oder Offset ungültig.";
      try {
        const raw = readSkillResource(skill, rest[1]);
        return `Ressource: ${rest[1]} · Zeichen ${offset}–${Math.min(offset + 10000, raw.length)} von ${raw.length}\n${raw.slice(offset, offset + 10000)}${offset + 10000 < raw.length ? `\nWeiter: skill read ${skill.id} ${rest[1]} ${offset + 10000}` : ""}`;
      } catch { return "Skill-Fehler: Ressource fehlt oder liegt ausserhalb des Skill-Pakets."; }
    }
    case "status": return JSON.stringify({ skills: catalog.skills.length, roots: catalog.roots.map((r) => r.path), warnings: catalog.warnings }, null, 2);
    default:
      return "Nutzung: list [seite] · search <q> [--page n] · load <id> [offset] · read <id> <pfad> [offset] · status";
  }
}

export const SKILLS_PATH = SKILLS_DIR;
