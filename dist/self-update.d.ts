export interface UpdateInfo {
    status: "current" | "available" | "blocked" | "error" | "unsupported";
    currentVersion: string;
    latestVersion: string | null;
    hasUpdate: boolean;
    checkedAt: string;
    currentCommit?: string;
    latestCommit?: string;
    branch?: string;
    remote?: string;
    upstreamRef?: string;
    message: string;
}
export interface UpdateResult {
    success: boolean;
    changed: boolean;
    fromVersion: string;
    toVersion: string;
    output: string;
    duration: number;
    commit?: string;
}
export interface UpdateOptions {
    /** Internal/test override. The command always uses its own installation. */
    installDir?: string;
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
}
/** Resolve from this module, never from the user's current project directory. */
export declare function getInstallDir(): string | null;
export declare function getCurrentVersion(installDir?: string | null): string;
export declare function checkForUpdate(options?: UpdateOptions): Promise<UpdateInfo>;
export declare function performUpdate(options?: UpdateOptions): Promise<UpdateResult>;
export declare function formatUpdateInfo(info: UpdateInfo): string;
export declare function formatUpdateResult(result: UpdateResult): string;
//# sourceMappingURL=self-update.d.ts.map