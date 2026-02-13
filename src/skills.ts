// ─── Skills System ───────────────────────────────────────
// Markdown-based skills with YAML frontmatter
// Loaded from ~/.morningstar/skills/*.md and .morningstar/skills/*.md

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";

export interface Skill {
  id: string;
  name: string;
  description: string;
  triggers?: string[];
  tools?: string[];
  agent?: string;
  tags?: string[];
  content: string;
  source: "global" | "project";
  filePath: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  tools?: string[];
  agent?: string;
  tags?: string[];
}

const GLOBAL_SKILLS_DIR = join(homedir(), ".morningstar", "skills");

function loadSkillsFromDir(dir: string, source: "global" | "project"): Skill[] {
  const skills: Skill[] = [];
  if (!existsSync(dir)) return skills;

  try {
    const files = readdirSync(dir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      try {
        const filePath = join(dir, file);
        const raw = readFileSync(filePath, "utf-8");
        const { frontmatter, content } = parseFrontmatter<SkillFrontmatter>(raw);
        const id = basename(file, ".md");

        skills.push({
          id,
          name: (frontmatter.name as string) || id,
          description: (frontmatter.description as string) || "",
          triggers: frontmatter.triggers as string[] | undefined,
          tools: frontmatter.tools as string[] | undefined,
          agent: frontmatter.agent as string | undefined,
          tags: frontmatter.tags as string[] | undefined,
          content,
          source,
          filePath,
        });
      } catch {}
    }
  } catch {}

  return skills;
}

export function loadSkills(cwd: string): Skill[] {
  const projectDir = join(cwd, ".morningstar", "skills");
  const globalSkills = loadSkillsFromDir(GLOBAL_SKILLS_DIR, "global");
  const projectSkills = loadSkillsFromDir(projectDir, "project");

  // Project skills override global skills with same id
  const merged = new Map<string, Skill>();
  for (const s of globalSkills) merged.set(s.id, s);
  for (const s of projectSkills) merged.set(s.id, s);

  return Array.from(merged.values());
}

export function getSkill(id: string, cwd: string): Skill | null {
  const skills = loadSkills(cwd);
  return skills.find(s => s.id === id) || null;
}

/**
 * Match a skill by trigger patterns against user input.
 * Returns the first matching skill or null.
 */
export function matchSkillByTrigger(input: string, cwd: string): Skill | null {
  const skills = loadSkills(cwd);
  const lower = input.toLowerCase();

  for (const skill of skills) {
    if (!skill.triggers || skill.triggers.length === 0) continue;
    for (const trigger of skill.triggers) {
      try {
        if (trigger.startsWith("/") && trigger.endsWith("/")) {
          // Regex trigger
          const regex = new RegExp(trigger.slice(1, -1), "i");
          if (regex.test(input)) return skill;
        } else {
          // String match trigger
          if (lower.includes(trigger.toLowerCase())) return skill;
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Create a new skill file.
 */
export function createSkill(
  id: string,
  name: string,
  description: string,
  content: string,
  options?: { triggers?: string[]; tools?: string[]; agent?: string; tags?: string[]; global?: boolean },
  cwd?: string
): { success: boolean; filePath?: string; error?: string } {
  const dir = options?.global
    ? GLOBAL_SKILLS_DIR
    : join(cwd || process.cwd(), ".morningstar", "skills");

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${id}.md`);
  if (existsSync(filePath)) {
    return { success: false, error: `Skill "${id}" existiert bereits: ${filePath}` };
  }

  const frontmatter: Record<string, unknown> = { name, description };
  if (options?.triggers) frontmatter.triggers = options.triggers;
  if (options?.tools) frontmatter.tools = options.tools;
  if (options?.agent) frontmatter.agent = options.agent;
  if (options?.tags) frontmatter.tags = options.tags;

  const fileContent = serializeFrontmatter(frontmatter, content);
  writeFileSync(filePath, fileContent, "utf-8");

  return { success: true, filePath };
}

/**
 * Format skill list for display.
 */
export function formatSkillsList(skills: Skill[]): string {
  if (skills.length === 0) return "  Keine Skills geladen.";
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
export function getSkillPromptAddition(skill: Skill): string {
  let addition = `\n\n--- Active Skill: ${skill.name} ---\n`;
  addition += skill.content;
  if (skill.tools && skill.tools.length > 0) {
    addition += `\n\nErlaubte Tools fuer diesen Skill: ${skill.tools.join(", ")}`;
  }
  addition += `\n--- Ende Skill ---`;
  return addition;
}
