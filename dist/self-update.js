// ─── Self-Update Mechanism ──────────────────────────────
// Check for updates from GitHub, pull latest changes,
// rebuild, and notify user of available updates.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
// ─── Constants ───────────────────────────────────────────
const CONFIG_DIR = join(homedir(), ".morningstar");
const UPDATE_CACHE_FILE = join(CONFIG_DIR, "update-check.json");
const REPO_URL = "https://github.com/morningstarnasser/morningstar-cli";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
// ─── Version Detection ──────────────────────────────────
/**
 * Get the current installed version from package.json.
 */
export function getCurrentVersion(installDir) {
    const dirs = [
        installDir,
        join(__dirname, ".."),
        join(__dirname, "../.."),
        process.cwd(),
    ].filter(Boolean);
    for (const dir of dirs) {
        const pkgPath = join(dir, "package.json");
        try {
            if (existsSync(pkgPath)) {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
                if (pkg.name === "morningstar-cli" && pkg.version) {
                    return pkg.version;
                }
            }
        }
        catch { }
    }
    return "1.0.0"; // fallback
}
/**
 * Get the installation directory of morningstar-cli.
 */
export function getInstallDir() {
    const dirs = [
        join(__dirname, ".."),
        join(__dirname, "../.."),
    ];
    for (const dir of dirs) {
        const pkgPath = join(dir, "package.json");
        const gitDir = join(dir, ".git");
        try {
            if (existsSync(pkgPath) && existsSync(gitDir)) {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
                if (pkg.name === "morningstar-cli")
                    return dir;
            }
        }
        catch { }
    }
    return null;
}
// ─── Update Check ────────────────────────────────────────
/**
 * Load cached update check result.
 */
function loadUpdateCache() {
    try {
        if (existsSync(UPDATE_CACHE_FILE)) {
            const data = JSON.parse(readFileSync(UPDATE_CACHE_FILE, "utf-8"));
            return data;
        }
    }
    catch { }
    return null;
}
/**
 * Save update check result to cache.
 */
function saveUpdateCache(info) {
    try {
        writeFileSync(UPDATE_CACHE_FILE, JSON.stringify(info, null, 2), "utf-8");
    }
    catch { }
}
/**
 * Check for updates from GitHub (uses git or GitHub API).
 * Caches the result to avoid frequent network calls.
 */
export function checkForUpdate(force = false) {
    const currentVersion = getCurrentVersion();
    const cached = loadUpdateCache();
    // Return cached if recent enough
    if (!force && cached) {
        const cacheAge = Date.now() - new Date(cached.checkedAt).getTime();
        if (cacheAge < CHECK_INTERVAL_MS) {
            return { ...cached, currentVersion };
        }
    }
    const info = {
        currentVersion,
        latestVersion: null,
        hasUpdate: false,
        checkedAt: new Date().toISOString(),
    };
    // Method 1: Check via git (if installed via git clone)
    const installDir = getInstallDir();
    if (installDir) {
        try {
            // Fetch latest from remote
            execSync("git fetch origin --quiet", {
                cwd: installDir,
                encoding: "utf-8",
                timeout: 15000,
                stdio: ["pipe", "pipe", "pipe"],
            });
            // Check if behind
            const behind = execSync("git rev-list HEAD..origin/main --count", {
                cwd: installDir,
                encoding: "utf-8",
                timeout: 5000,
            }).trim();
            const behindCount = parseInt(behind, 10);
            if (behindCount > 0) {
                info.hasUpdate = true;
                info.latestVersion = `+${behindCount} commits`;
                // Get latest commit message as release notes
                try {
                    const log = execSync("git log origin/main -1 --format=%s", {
                        cwd: installDir,
                        encoding: "utf-8",
                        timeout: 5000,
                    }).trim();
                    info.releaseNotes = log;
                }
                catch { }
            }
            else {
                info.latestVersion = currentVersion;
            }
        }
        catch {
            // Git check failed — try npm/API fallback
            info.latestVersion = null;
        }
    }
    // Method 2: Check GitHub tags/releases via API (fallback)
    if (info.latestVersion === null) {
        try {
            const result = execSync(`curl -sf --max-time 10 "https://api.github.com/repos/morningstarnasser/morningstar-cli/releases/latest"`, { encoding: "utf-8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"] });
            const release = JSON.parse(result);
            if (release.tag_name) {
                info.latestVersion = release.tag_name.replace(/^v/, "");
                info.releaseNotes = release.body?.slice(0, 500);
                info.publishedAt = release.published_at;
                info.hasUpdate = compareVersions(currentVersion, info.latestVersion) < 0;
            }
        }
        catch {
            // API check also failed
            info.latestVersion = null;
        }
    }
    saveUpdateCache(info);
    return info;
}
/**
 * Compare semver versions. Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareVersions(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const va = pa[i] || 0;
        const vb = pb[i] || 0;
        if (va < vb)
            return -1;
        if (va > vb)
            return 1;
    }
    return 0;
}
// ─── Self-Update ─────────────────────────────────────────
/**
 * Perform the self-update: git pull, npm install, npm run build.
 */
export function performUpdate() {
    const startTime = Date.now();
    const currentVersion = getCurrentVersion();
    const installDir = getInstallDir();
    if (!installDir) {
        return {
            success: false,
            fromVersion: currentVersion,
            toVersion: currentVersion,
            output: "Installations-Verzeichnis nicht gefunden. Bitte manuell updaten:\n  cd morningstar-cli && git pull && npm install && npm run build",
            duration: Date.now() - startTime,
        };
    }
    const outputs = [];
    try {
        // Step 1: Git pull
        outputs.push("$ git pull origin main");
        const pullOutput = execSync("git pull origin main", {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 30000,
        });
        outputs.push(pullOutput.trim());
        // Check if already up to date
        if (pullOutput.includes("Already up to date") || pullOutput.includes("Bereits aktuell")) {
            return {
                success: true,
                fromVersion: currentVersion,
                toVersion: currentVersion,
                output: outputs.join("\n") + "\n\nBereits auf dem neuesten Stand.",
                duration: Date.now() - startTime,
            };
        }
        // Step 2: npm install
        outputs.push("\n$ npm install");
        const installOutput = execSync("npm install --production=false", {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 120000,
        });
        outputs.push(installOutput.trim().split("\n").slice(-3).join("\n"));
        // Step 3: npm run build
        outputs.push("\n$ npm run build");
        const buildOutput = execSync("npm run build", {
            cwd: installDir,
            encoding: "utf-8",
            timeout: 60000,
        });
        outputs.push(buildOutput.trim());
        // Get new version
        const newVersion = getCurrentVersion(installDir);
        return {
            success: true,
            fromVersion: currentVersion,
            toVersion: newVersion,
            output: outputs.join("\n"),
            duration: Date.now() - startTime,
        };
    }
    catch (e) {
        const error = e;
        outputs.push(`\nFehler: ${error.message}`);
        return {
            success: false,
            fromVersion: currentVersion,
            toVersion: currentVersion,
            output: outputs.join("\n"),
            duration: Date.now() - startTime,
        };
    }
}
/**
 * Format update info for display.
 */
export function formatUpdateInfo(info) {
    const lines = [];
    lines.push(`  Version:  ${info.currentVersion}`);
    if (info.hasUpdate && info.latestVersion) {
        lines.push(`  Update:   ${info.latestVersion} verfuegbar!`);
        if (info.releaseNotes) {
            lines.push(`  Notes:    ${info.releaseNotes.slice(0, 100)}`);
        }
        lines.push(`  Update:   /update ausfuehren`);
    }
    else if (info.latestVersion) {
        lines.push(`  Status:   Auf dem neuesten Stand`);
    }
    else {
        lines.push(`  Status:   Update-Check fehlgeschlagen`);
    }
    lines.push(`  Geprueft: ${info.checkedAt.split("T")[0]}`);
    return lines.join("\n");
}
/**
 * Format update result for display.
 */
export function formatUpdateResult(result) {
    const icon = result.success ? "\u2714" : "\u2718";
    const duration = result.duration >= 1000
        ? `${(result.duration / 1000).toFixed(1)}s`
        : `${result.duration}ms`;
    const lines = [
        `  ${icon} Self-Update ${result.success ? "erfolgreich" : "fehlgeschlagen"} (${duration})`,
        `  Von: ${result.fromVersion} -> ${result.toVersion}`,
    ];
    // Show last few lines of output
    const outputLines = result.output.split("\n").filter(l => l.trim());
    const relevant = outputLines.slice(-5);
    if (relevant.length > 0) {
        lines.push("");
        for (const l of relevant) {
            lines.push(`  ${l}`);
        }
    }
    if (result.success && result.fromVersion !== result.toVersion) {
        lines.push("\n  Bitte morningstar neu starten fuer die neuen Aenderungen.");
    }
    return lines.join("\n");
}
//# sourceMappingURL=self-update.js.map