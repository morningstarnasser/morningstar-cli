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
export declare function loadSkills(cwd: string): Skill[];
export declare function getSkill(id: string, cwd: string): Skill | null;
/**
 * Match a skill by trigger patterns against user input.
 * Returns the first matching skill or null.
 */
export declare function matchSkillByTrigger(input: string, cwd: string): Skill | null;
/**
 * Create a new skill file.
 */
export declare function createSkill(id: string, name: string, description: string, content: string, options?: {
    triggers?: string[];
    tools?: string[];
    agent?: string;
    tags?: string[];
    global?: boolean;
}, cwd?: string): {
    success: boolean;
    filePath?: string;
    error?: string;
};
/**
 * Format skill list for display.
 */
export declare function formatSkillsList(skills: Skill[]): string;
/**
 * Get the prompt addition for an active skill.
 */
export declare function getSkillPromptAddition(skill: Skill): string;
//# sourceMappingURL=skills.d.ts.map