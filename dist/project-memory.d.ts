export declare function loadProjectMemory(cwd: string): string | null;
export declare function getProjectMemoryPath(cwd: string): string | null;
export declare function createProjectMemory(cwd: string, context: {
    language?: string;
    framework?: string;
    projectName?: string;
}): string;
export declare function appendProjectMemory(cwd: string, text: string): boolean;
//# sourceMappingURL=project-memory.d.ts.map