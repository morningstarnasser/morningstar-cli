// ─── OS-Level Sandboxing ─────────────────────────────────
// macOS sandbox-exec and Linux firejail support

import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform, tmpdir } from "node:os";

export interface SandboxConfig {
  enabled: boolean;
  allowedPaths: string[];
  networkAccess: boolean;
}

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: false,
  allowedPaths: [],
  networkAccess: true,
};

let currentConfig: SandboxConfig = { ...DEFAULT_CONFIG };

/**
 * Enable sandboxing with the given config.
 */
export function enableSandbox(config?: Partial<SandboxConfig>): void {
  currentConfig = { ...DEFAULT_CONFIG, ...config, enabled: true };
}

/**
 * Disable sandboxing.
 */
export function disableSandbox(): void {
  currentConfig.enabled = false;
}

/**
 * Check if sandboxing is available on this platform.
 */
export function isSandboxAvailable(): { available: boolean; tool: string; message: string } {
  const os = platform();

  if (os === "darwin") {
    try {
      execSync("which sandbox-exec", { encoding: "utf-8", timeout: 3000 });
      return { available: true, tool: "sandbox-exec", message: "macOS sandbox-exec verfuegbar" };
    } catch {
      return { available: false, tool: "sandbox-exec", message: "sandbox-exec nicht gefunden (macOS built-in)" };
    }
  }

  if (os === "linux") {
    try {
      execSync("which firejail", { encoding: "utf-8", timeout: 3000 });
      return { available: true, tool: "firejail", message: "firejail verfuegbar" };
    } catch {
      return { available: false, tool: "firejail", message: "firejail nicht installiert. Install: sudo apt install firejail" };
    }
  }

  return { available: false, tool: "none", message: `Sandboxing nicht unterstuetzt auf ${os}` };
}

/**
 * Generate a macOS sandbox profile.
 */
function generateMacOSProfile(config: SandboxConfig): string {
  const lines: string[] = [
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
    const escaped = escapeSandboxString(p);
    lines.push(`(allow file-read* (subpath "${escaped}"))`);
    lines.push(`(allow file-write* (subpath "${escaped}"))`);
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
export function sandboxCommand(command: string, cwd: string): string {
  if (!currentConfig.enabled) return command;

  const os = platform();
  const allowedPaths = [...currentConfig.allowedPaths, cwd, tmpdir()];

  if (os === "darwin") {
    const profile = generateMacOSProfile({ ...currentConfig, allowedPaths });
    const profilePath = join(tmpdir(), `morningstar-sandbox-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sb`);
    writeFileSync(profilePath, profile, "utf-8");
    // Clean up profile after use
    const wrapped = `sandbox-exec -f ${shellQuote(profilePath)} /bin/sh -c ${shellQuote(command)}; sandbox_status=$?; rm -f ${shellQuote(profilePath)}; exit $sandbox_status`;
    return wrapped;
  }

  if (os === "linux") {
    const whitelistArgs = allowedPaths
      .filter(p => existsSync(p))
      .map(p => `--whitelist=${shellQuote(p)}`)
      .join(" ");
    return `firejail --quiet ${whitelistArgs}${currentConfig.networkAccess ? "" : " --net=none"} -- /bin/sh -c ${shellQuote(command)}`;
  }

  // Enabling a sandbox must never silently degrade to unsandboxed execution.
  return `printf '%s\\n' 'Sandbox aktiviert, aber auf dieser Plattform nicht verfuegbar.' >&2; exit 126`;
}

/** Quote one argument for the POSIX shell used by the sandbox wrappers. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

/** Escape a path embedded in a macOS sandbox profile string literal. */
function escapeSandboxString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/**
 * Get sandbox status display.
 */
export function getSandboxStatus(): string {
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
