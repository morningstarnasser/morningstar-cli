export interface Rule {
    id: string;
    content: string;
    source: "global" | "project";
    filePath: string;
    pathPattern?: string;
    priority?: number;
    description?: string;
}
/**
 * Load all rules (global + project + MORNINGSTAR.md).
 */
export declare function loadRules(cwd: string): Rule[];
/**
 * Get rules applicable to a specific file path.
 */
export declare function getApplicableRules(cwd: string, filePath?: string): Rule[];
/**
 * Create a new rule file.
 */
export declare function createRule(id: string, content: string, options?: {
    description?: string;
    pathPattern?: string;
    priority?: number;
    global?: boolean;
}, cwd?: string): {
    success: boolean;
    filePath?: string;
    error?: string;
};
/**
 * Build rules prompt addition for system prompt.
 */
export declare function buildRulesPrompt(cwd: string): string;
/**
 * Format rules list for display.
 */
export declare function formatRulesList(rules: Rule[]): string;
//# sourceMappingURL=rules.d.ts.map