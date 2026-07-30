export interface SandboxConfig {
    enabled: boolean;
    allowedPaths: string[];
    networkAccess: boolean;
}
/**
 * Enable sandboxing with the given config.
 */
export declare function enableSandbox(config?: Partial<SandboxConfig>): void;
/**
 * Disable sandboxing.
 */
export declare function disableSandbox(): void;
/**
 * Check if sandboxing is available on this platform.
 */
export declare function isSandboxAvailable(): {
    available: boolean;
    tool: string;
    message: string;
};
/**
 * Wrap a command with sandbox restrictions.
 */
export declare function sandboxCommand(command: string, cwd: string): string;
/**
 * Get sandbox status display.
 */
export declare function getSandboxStatus(): string;
//# sourceMappingURL=sandbox.d.ts.map