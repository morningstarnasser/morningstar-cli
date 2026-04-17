export type CheckCategory = "config" | "agents" | "skills" | "commands" | "rules" | "mcp" | "hooks" | "memory" | "learning";
export type CheckStatus = "pass" | "warn" | "fail";
export interface HarnessCheck {
    name: string;
    category: CheckCategory;
    status: CheckStatus;
    message: string;
    fix?: string;
}
export interface RepairResult {
    fixed: number;
    remaining: number;
}
/**
 * Run all health checks (doctor mode).
 * Validates the structural integrity of the ~/.morningstar installation.
 */
export declare function runDoctor(): Promise<HarnessCheck[]>;
/**
 * Run deeper analysis (audit mode).
 * Identifies duplicates, orphans, bloat, and content quality issues.
 */
export declare function runAudit(): Promise<HarnessCheck[]>;
/**
 * Auto-fix issues identified by doctor/audit checks.
 * Only acts on checks that have a `fix` property.
 *
 * Supported fix actions:
 * - create-dir:<subdir>   Create missing directory
 * - create-config         Initialize config.json
 * - create-settings       Initialize settings.json
 * - create-memory         Initialize memory.json
 * - reset-config          Overwrite invalid config.json
 * - reset-settings        Overwrite invalid settings.json
 * - reset-memory          Overwrite invalid memory.json
 * - reset-mcp-catalog     Overwrite invalid mcp-catalog.json
 * - remove-duplicate-agents  Remove duplicates, keeping newest
 */
export declare function runRepair(checks: ReadonlyArray<HarnessCheck>): RepairResult;
/**
 * Format doctor results as colored terminal output.
 * Groups checks by category with status icons and summary.
 */
export declare function formatDoctorReport(checks: ReadonlyArray<HarnessCheck>): string;
/**
 * Format audit results as a detailed terminal report.
 * Similar to doctor report but with more detail and context.
 */
export declare function formatAuditReport(checks: ReadonlyArray<HarnessCheck>): string;
//# sourceMappingURL=harness.d.ts.map