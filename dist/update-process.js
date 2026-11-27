import { spawn, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
/** Run npm's JS entry on Windows; never interpolate arguments into cmd.exe. */
export function npmInvocation(env = process.env, node = process.execPath) {
    const candidates = [env.npm_execpath, join(dirname(node), "node_modules", "npm", "bin", "npm-cli.js")];
    for (const dir of (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)) {
        const bin = join(dir.replace(/^"|"$/g, ""), "npm");
        try {
            candidates.push(realpathSync(bin));
        }
        catch { /* next PATH entry */ }
        candidates.push(join(dir, "node_modules", "npm", "bin", "npm-cli.js"));
    }
    for (const path of candidates) {
        if (path?.endsWith("npm-cli.js") && existsSync(path))
            return { command: node, args: [path] };
    }
    throw Object.assign(new Error("npm wurde nicht gefunden. Bitte Node.js mit npm installieren."), { name: "UpdateProcessError" });
}
export function runUpdateProcess(command, args, cwd, phase, timeout, signal) {
    return new Promise((resolve, reject) => {
        const fail = (detail) => Object.assign(new Error(`${phase} fehlgeschlagen (${detail}).`), { name: "UpdateProcessError" });
        if (signal?.aborted) {
            reject(fail("abgebrochen"));
            return;
        }
        // Do not let caller Git environment redirect the installation or inject
        // config. Normal credential helpers configured in Git still work.
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
        env.GIT_TERMINAL_PROMPT = "0";
        env.GCM_INTERACTIVE = "never";
        const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        let reason;
        let killTimer;
        const stop = (why) => {
            if (reason)
                return;
            reason = why;
            if (!child.pid)
                return;
            if (process.platform === "win32") {
                spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 5000 });
            }
            else {
                try {
                    process.kill(-child.pid, "SIGTERM");
                }
                catch {
                    child.kill();
                }
                killTimer = setTimeout(() => { try {
                    process.kill(-child.pid, "SIGKILL");
                }
                catch { /* exited */ } }, 1000);
                killTimer.unref();
            }
        };
        const timer = setTimeout(() => stop("Zeitlimit"), timeout);
        const abort = () => stop("abgebrochen");
        signal?.addEventListener("abort", abort, { once: true });
        child.stdout.on("data", chunk => {
            output += chunk.toString();
            if (output.length > 2 * 1024 * 1024)
                stop("zu viel Ausgabe");
        });
        child.stderr.resume(); // Drain without exposing credentials from child output.
        const cleanup = () => { clearTimeout(timer); if (killTimer)
            clearTimeout(killTimer); signal?.removeEventListener("abort", abort); };
        child.on("error", () => { cleanup(); reject(fail("Prozess konnte nicht gestartet werden")); });
        child.on("close", code => { cleanup(); if (code === 0 && !reason)
            resolve(output);
        else
            reject(fail(reason ?? `Exit ${code}`)); });
    });
}
//# sourceMappingURL=update-process.js.map