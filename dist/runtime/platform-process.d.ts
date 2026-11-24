import { existsSync } from "node:fs";
/** npm .cmd/.ps1 shims cannot be spawned without cmd.exe. Launch their known
 * JavaScript entry points with Node, keeping every argument out of a shell. */
export declare function vendorCommand(bin: string, args: string[], options?: {
    platform?: string;
    env?: NodeJS.ProcessEnv;
    exists?: (path: string) => boolean;
    node?: string;
}): {
    file: string;
    args: string[];
};
/** Prefer installed Git Bash to the unrelated System32 WSL launcher. */
export declare function bashExecutable(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, exists?: typeof existsSync): string;
/** Git for Windows supplies the POSIX tools used by the Bash runtime. */
export declare function gitExecutable(name: "bash" | "grep", platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, exists?: typeof existsSync): string;
export declare function toolEnvironment(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
//# sourceMappingURL=platform-process.d.ts.map