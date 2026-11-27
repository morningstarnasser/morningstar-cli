/** Run npm's JS entry on Windows; never interpolate arguments into cmd.exe. */
export declare function npmInvocation(env?: NodeJS.ProcessEnv, node?: string): {
    command: string;
    args: string[];
};
export declare function runUpdateProcess(command: string, args: string[], cwd: string, phase: string, timeout: number, signal?: AbortSignal): Promise<string>;
//# sourceMappingURL=update-process.d.ts.map