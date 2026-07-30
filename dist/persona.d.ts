export declare const AGENT_NAME = "Carry";
export interface PersonaFiles {
    soul?: string;
    user?: string;
    memory?: string;
    agents?: string;
}
/** Read the persona files from a directory. Pure (fs injected) for testing. */
export declare function loadPersonaFrom(dir: string, readFile?: (p: string) => string, exists?: (p: string) => boolean): PersonaFiles;
/** Assemble the persona files into a single system-prompt block. Pure. */
export declare function buildPersonaPrompt(files: PersonaFiles): string;
/** Load + assemble the persona block from ~/.morningstar/. */
export declare function loadPersona(dir?: string): string;
/** Write any missing persona files with defaults. Returns the seeded names. */
export declare function seedPersonaDefaults(dir?: string): string[];
export declare const PERSONA_DIR: string;
//# sourceMappingURL=persona.d.ts.map