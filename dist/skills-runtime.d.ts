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
export declare function parseSkillMeta(content: string, name: string): SkillMeta;
/** True if every required command resolves on PATH. */
export declare function checkReadiness(requires: string[], exists: (cmd: string) => boolean): boolean;
/** List local skills (name = path relative to the skills dir). */
export declare function listSkills(dir?: string): SkillMeta[];
/** Keyword search over name + description. Pure given the skill list. */
export declare function searchSkills(query: string, skills: SkillMeta[]): SkillMeta[];
/** Load a skill's full procedure text, or null if not found. */
export declare function loadSkill(name: string, dir?: string): string | null;
/**
 * Handle a `<tool:skill>...</tool>` argument: "list", "search <q>", "load <name>".
 * Returns text for the agent. Delegating side effects stay with the agent.
 */
export declare function runSkillCommand(arg: string): string;
export declare const SKILLS_PATH: string;
//# sourceMappingURL=skills-runtime.d.ts.map