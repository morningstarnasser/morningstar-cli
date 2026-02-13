// ─── OS-Level Sandboxing ─────────────────────────────────
// macOS sandbox-exec and Linux firejail support
import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform, tmpdir } from "node:os";
const DEFAULT_CONFIG = {
    enabled: false,
    allowedPaths: [],
    networkAccess: true,
};
let currentConfig = { ...DEFAULT_CONFIG };
/**
 * Enable sandboxing with the given config.
 */
export function enableSandbox(config) {
    currentConfig = { ...DEFAULT_CONFIG, ...config, enabled: true };
}
/**
 * Disable sandboxing.
 */
export function disableSandbox() {
    currentConfig.enabled = false;
}
/**
 * Check if sandboxing is available on this platform.
 */
export function isSandboxAvailable() {
    const os = platform();
    if (os === "darwin") {
        try {
            execSync("which sandbox-exec", { encoding: "utf-8", timeout: 3000 });
            return { available: true, tool: "sandbox-exec", message: "macOS sandbox-exec verfuegbar" };
        }
        catch {
            return { available: false, tool: "sandbox-exec", message: "sandbox-exec nicht gefunden (macOS built-in)" };
        }
    }
    if (os === "linux") {
        try {
            execSync("which firejail", { encoding: "utf-8", timeout: 3000 });
            return { available: true, tool: "firejail", message: "firejail verfuegbar" };
        }
        catch {
            return { available: false, tool: "firejail", message: "firejail nicht installiert. Install: sudo apt install firejail" };
        }
    }
    return { available: false, tool: "none", message: `Sandboxing nicht unterstuetzt auf ${os}` };
}
/**
 * Generate a macOS sandbox profile.
 */
function generateMacOSProfile(config) {
    const lines = [
        "(version 1)",
        "(deny default)",
        "(allow process-exec)",
        "(allow process-fork)",
        "(allow sysctl-read)",
        "(allow mach-lookup)",
        // Allow reading system files
        '(allow file-read* (subpath "/usr"))',
        '(allow file-read* (subpath "/bin"))',
        '(allow file-read* (subpath "/sbin"))',
        '(allow file-read* (subpath "/Library"))',
        '(allow file-read* (subpath "/System"))',
        '(allow file-read* (subpath "/private/var/db"))',
        '(allow file-read* (subpath "/dev"))',
        '(allow file-read* (subpath "/tmp"))',
        '(allow file-write* (subpath "/tmp"))',
        '(allow file-write* (subpath "/dev"))',
    ];
    // Allow read/write to specified paths
    for (const p of config.allowedPaths) {
        lines.push(`(allow file-read* (subpath "${p}"))`);
        lines.push(`(allow file-write* (subpath "${p}"))`);
    }
    // Network
    if (config.networkAccess) {
        lines.push("(allow network*)");
    }
    return lines.join("\n");
}
/**
 * Wrap a command with sandbox restrictions.
 */
export function sandboxCommand(command, cwd) {
    if (!currentConfig.enabled)
        return command;
    const os = platform();
    const allowedPaths = [...currentConfig.allowedPaths, cwd, tmpdir()];
    if (os === "darwin") {
        const profile = generateMacOSProfile({ ...currentConfig, allowedPaths });
        const profilePath = join(tmpdir(), `morningstar-sandbox-${Date.now()}.sb`);
        writeFileSync(profilePath, profile, "utf-8");
        // Clean up profile after use
        const wrapped = `sandbox-exec -f "${profilePath}" /bin/sh -c ${JSON.stringify(command)}; rm -f "${profilePath}"`;
        return wrapped;
    }
    if (os === "linux") {
        const whitelistArgs = allowedPaths
            .filter(p => existsSync(p))
            .map(p => `--whitelist=${p}`)
            .join(" ");
        return `firejail --quiet ${whitelistArgs}${currentConfig.networkAccess ? "" : " --net=none"} -- /bin/sh -c ${JSON.stringify(command)}`;
    }
    // Unsupported OS — run without sandbox
    return command;
}
/**
 * Get sandbox status display.
 */
export function getSandboxStatus() {
    const { available, tool, message } = isSandboxAvailable();
    const lines = [
        `Sandbox Status:`,
        `  Plattform:    ${platform()}`,
        `  Tool:         ${tool}`,
        `  Verfuegbar:   ${available ? "Ja" : "Nein"} — ${message}`,
        `  Aktiviert:    ${currentConfig.enabled ? "Ja" : "Nein"}`,
    ];
    if (currentConfig.enabled) {
        lines.push(`  Netzwerk:     ${currentConfig.networkAccess ? "Erlaubt" : "Blockiert"}`);
        lines.push(`  Erlaubte Pfade:`);
        for (const p of currentConfig.allowedPaths) {
            lines.push(`    ${p}`);
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=sandbox.js.map