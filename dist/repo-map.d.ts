export interface FileSignature {
    path: string;
    exports: string[];
    imports: string[];
    lines: number;
}
export interface RepoStats {
    totalFiles: number;
    totalLines: number;
    languages: Record<string, number>;
    largestFiles: {
        path: string;
        lines: number;
    }[];
}
export declare function getRepoStats(cwd: string): RepoStats;
export declare function getRepoMap(cwd: string): FileSignature[];
export declare function getRepoMapCompact(cwd: string): string;
export declare function generateOnboarding(cwd: string): string;
export declare function generateProjectScore(cwd: string): {
    quality: number;
    testCoverage: number;
    typeSafety: number;
    documentation: number;
    security: number;
    overall: number;
    quickWins: string[];
};
export declare function generateCodeRoast(cwd: string): string;
//# sourceMappingURL=repo-map.d.ts.map