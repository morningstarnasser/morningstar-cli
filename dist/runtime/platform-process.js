import { existsSync } from "node:fs";
import { delimiter, join, win32 } from "node:path";
/** npm .cmd/.ps1 shims cannot be spawned without cmd.exe. Launch their known
 * JavaScript entry points with Node, keeping every argument out of a shell. */
export function vendorCommand(bin, args, options = {}) {
    if ((options.platform ?? process.platform) !== "win32")
        return { file: bin, args };
    const env = options.env ?? process.env, exists = options.exists ?? existsSync;
    const entries = { codex: ["@openai", "codex", "bin", "codex.js"], claude: ["@anthropic-ai", "claude-code", "cli.js"], qmd: ["@tobilu", "qmd", "bin", "qmd"] };
    const entry = entries[bin];
    if (!entry)
        return { file: bin, args };
    const key = Object.keys(env).find(k => k.toLowerCase() === "path") ?? "PATH";
    const directories = (env[key] ?? "").split(";").filter(Boolean);
    if (bin === "qmd" && env.USERPROFILE)
        directories.push(win32.join(env.USERPROFILE, ".morningstar", "tools", "qmd"));
    for (const directory of directories) {
        const dir = directory.replace(/^"|"$/g, "");
        const native = win32.join(dir, `${bin}.exe`);
        if (exists(native))
            return { file: native, args };
        const script = win32.join(dir, "node_modules", ...entry);
        if (exists(script))
            return { file: options.node ?? process.execPath, args: [script, ...args] };
    }
    return { file: bin, args };
}
/** Prefer installed Git Bash to the unrelated System32 WSL launcher. */
export function bashExecutable(platform = process.platform, env = process.env, exists = existsSync) {
    return gitExecutable("bash", platform, env, exists);
}
/** Git for Windows supplies the POSIX tools used by the Bash runtime. */
export function gitExecutable(name, platform = process.platform, env = process.env, exists = existsSync) {
    if (platform === "win32") {
        for (const root of [env.ProgramW6432, env.ProgramFiles, "C:\\Program Files"].filter(Boolean)) {
            const candidate = win32.join(root, "Git", ...(name === "bash" ? ["bin"] : ["usr", "bin"]), `${name}.exe`);
            if (exists(candidate))
                return candidate;
        }
    }
    return name;
}
export function toolEnvironment(env = process.env) {
    const key = Object.keys(env).find(k => k.toLowerCase() === "path") ?? "PATH";
    const home = env.USERPROFILE ?? env.HOME ?? "";
    return { ...env, [key]: [join(home, ".bun", "bin"), join(home, ".local", "bin"), env[key] ?? ""].join(delimiter) };
}
//# sourceMappingURL=platform-process.js.map