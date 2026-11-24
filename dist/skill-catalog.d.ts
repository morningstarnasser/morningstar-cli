export interface SkillRoot {
    path: string;
    label: string;
    trusted: boolean;
    flat?: boolean;
}
export interface CatalogSkill {
    id: string;
    name: string;
    description: string;
    filePath: string;
    baseDir: string;
    source: "global" | "project";
    origin: string;
    triggers: string[];
    requires: string[];
}
export interface SkillCatalog {
    skills: CatalogSkill[];
    roots: SkillRoot[];
    warnings: string[];
}
export declare function defaultSkillRoots(cwd: string, home?: string): SkillRoot[];
export declare function discoverSkills(cwd: string, options?: {
    roots?: SkillRoot[];
    fresh?: boolean;
}): SkillCatalog;
export declare function readCatalogSkill(skill: CatalogSkill): string;
export declare function readSkillResource(skill: CatalogSkill, resource: string): string;
//# sourceMappingURL=skill-catalog.d.ts.map