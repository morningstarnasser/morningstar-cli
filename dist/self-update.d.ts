export interface UpdateInfo {
    currentVersion: string;
    latestVersion: string | null;
    hasUpdate: boolean;
    releaseNotes?: string;
    publishedAt?: string;
    checkedAt: string;
}
export interface UpdateResult {
    success: boolean;
    fromVersion: string;
    toVersion: string;
    output: string;
    duration: number;
}
/**
 * Get the current installed version from package.json.
 */
export declare function getCurrentVersion(installDir?: string): string;
/**
 * Get the installation directory of morningstar-cli.
 */
export declare function getInstallDir(): string | null;
/**
 * Check for updates from GitHub (uses git or GitHub API).
 * Caches the result to avoid frequent network calls.
 */
export declare function checkForUpdate(force?: boolean): UpdateInfo;
/**
 * Compare semver versions. Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export declare function compareVersions(a: string, b: string): number;
/**
 * Perform the self-update: git pull, npm install, npm run build.
 */
export declare function performUpdate(): UpdateResult;
/**
 * Format update info for display.
 */
export declare function formatUpdateInfo(info: UpdateInfo): string;
/**
 * Format update result for display.
 */
export declare function formatUpdateResult(result: UpdateResult): string;
//# sourceMappingURL=self-update.d.ts.map