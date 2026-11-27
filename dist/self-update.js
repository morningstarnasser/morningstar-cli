// Only Node built-ins: the launcher can update without loading the application.
import { existsSync, readFileSync, realpathSync, mkdtempSync, openSync, closeSync, writeFileSync, unlinkSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { runUpdateProcess, npmInvocation } from "./update-process.js";
class UpdateError extends Error {
    status;
    constructor(message, status = "error") {
        super(message);
        this.status = status;
    }
}
function packageVersion(dir) {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    if (pkg.name !== "morningstar-cli" || typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(pkg.version))
        throw new UpdateError("Kein gültiges Morningstar-Paket in dieser Installation.");
    return pkg.version;
}
/** Resolve from this module, never from the user's current project directory. */
export function getInstallDir() {
    try {
        const dir = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
        packageVersion(dir);
        return dir;
    }
    catch {
        return null;
    }
}
export function getCurrentVersion(installDir = getInstallDir()) {
    try {
        return installDir ? packageVersion(installDir) : "unbekannt";
    }
    catch {
        return "unbekannt";
    }
}
async function git(dir, args, signal) {
    return (await runUpdateProcess("git", ["-c", "core.hooksPath=", ...args], dir, "Git-Prüfung", 60_000, signal)).trim();
}
async function requireClean(dir) {
    try {
        await git(dir, ["diff", "--quiet", "--ignore-submodules=none"]);
        await git(dir, ["diff", "--cached", "--quiet", "--ignore-submodules=none"]);
    }
    catch {
        throw new UpdateError("Lokale Änderungen gefunden. Bitte zuerst selbst committen oder sichern; nichts wurde überschrieben.", "blocked");
    }
    if (await git(dir, ["ls-files", "--others", "--exclude-standard"]))
        throw new UpdateError("Unversionierte Dateien gefunden. Bitte zuerst selbst sichern oder einordnen; nichts wurde gelöscht.", "blocked");
}
async function installation(options) {
    const path = options.installDir ?? getInstallDir();
    if (!path || !existsSync(join(path, ".git")))
        throw new UpdateError("Automatische Updates benötigen eine Git-Installation (git clone und npm link). Dieses Paket bitte über seinen ursprünglichen Installationsweg aktualisieren.", "unsupported");
    const dir = realpathSync(path);
    packageVersion(dir);
    const top = await git(dir, ["rev-parse", "--show-toplevel"], options.signal);
    if (realpathSync(top) !== dir)
        throw new UpdateError("Git-Wurzel und Morningstar-Installation stimmen nicht überein.", "blocked");
    return dir;
}
async function lock(dir) {
    const common = await git(dir, ["rev-parse", "--git-common-dir"]);
    const path = resolve(dir, common, "morningstar-update.lock");
    let fd;
    try {
        fd = openSync(path, "wx", 0o600);
    }
    catch {
        throw new UpdateError("Eine Update-Sperre besteht. Falls kein Update mehr läuft, die Datei morningstar-update.lock im Git-Verzeichnis prüfen und entfernen.", "blocked");
    }
    try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + "\n");
    }
    finally {
        closeSync(fd);
    }
    return () => unlinkSync(path);
}
async function inspect(dir, options) {
    await requireClean(dir);
    const branch = await git(dir, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "");
    if (!branch)
        throw new UpdateError("Detached HEAD: zuerst den gewünschten Update-Zweig auschecken.", "blocked");
    const remote = await git(dir, ["config", "--get", `branch.${branch}.remote`]).catch(() => "");
    const merge = await git(dir, ["config", "--get", `branch.${branch}.merge`]).catch(() => "");
    if (!remote || remote === "." || remote.startsWith("-") || !merge.startsWith("refs/heads/") || merge.includes("\n"))
        throw new UpdateError("Kein gültiger Remote-Tracking-Zweig eingerichtet. Bitte den Upstream dieser Installation konfigurieren.", "blocked");
    // A configured name only; never interpret branch.remote as a new URL.
    await git(dir, ["remote", "get-url", "--", remote]).catch(() => { throw new UpdateError("Der konfigurierte Remote fehlt.", "blocked"); });
    options.onProgress?.("Prüfe den konfigurierten Update-Zweig …");
    // A private ref avoids racing a user's unrelated fetch and its FETCH_HEAD.
    const fetchRef = `refs/morningstar-update/${randomUUID()}`;
    let latestCommit;
    try {
        await runUpdateProcess("git", ["-c", "core.hooksPath=", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "--", remote, `${merge}:${fetchRef}`], dir, "Abruf des Update-Zweigs", 60_000, options.signal);
        latestCommit = await git(dir, ["rev-parse", `${fetchRef}^{commit}`]);
    }
    finally {
        await git(dir, ["update-ref", "-d", fetchRef]);
    }
    const currentCommit = await git(dir, ["rev-parse", "HEAD"]);
    const [ahead, behind] = (await git(dir, ["rev-list", "--left-right", "--count", `${currentCommit}...${latestCommit}`])).split(/\s+/).map(Number);
    if (ahead !== 0)
        throw new UpdateError("Lokale Commits oder abweichende Historie gefunden. Automatisch sind nur Fast-forward-Updates möglich.", "blocked");
    const candidate = JSON.parse(await git(dir, ["show", `${latestCommit}:package.json`]));
    if (candidate.name !== "morningstar-cli" || typeof candidate.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(candidate.version))
        throw new UpdateError("Der Update-Zweig enthält kein gültiges Morningstar-Paket.");
    return { status: behind > 0 ? "available" : "current", currentVersion: packageVersion(dir), latestVersion: candidate.version,
        hasUpdate: behind > 0, checkedAt: new Date().toISOString(), currentCommit, latestCommit, branch, remote, upstreamRef: merge,
        message: behind > 0 ? `${behind} neue Commits verfügbar. Im Terminal: morningstar update` : "Bereits auf dem neuesten Stand." };
}
function errorMessage(error) {
    return error instanceof UpdateError || (error instanceof Error && error.name === "UpdateProcessError")
        ? error.message : "Update-Prüfung fehlgeschlagen. Installation und Git-Konfiguration prüfen.";
}
export async function checkForUpdate(options = {}) {
    let unlock;
    try {
        const dir = await installation(options);
        unlock = await lock(dir);
        return await inspect(dir, options);
    }
    catch (error) {
        return { status: error instanceof UpdateError ? error.status : "error", currentVersion: getCurrentVersion(options.installDir), latestVersion: null,
            hasUpdate: false, checkedAt: new Date().toISOString(), message: errorMessage(error) };
    }
    finally {
        unlock?.();
    }
}
export async function performUpdate(options = {}) {
    const start = Date.now();
    const fromVersion = getCurrentVersion(options.installDir);
    const result = { success: false, changed: false, fromVersion, toVersion: fromVersion, duration: 0, output: "" };
    let unlock;
    let dir;
    let stage;
    let candidate;
    let worktree = false;
    let movedOld = false;
    let movedNew = false;
    let activated = false;
    let retain = false;
    try {
        dir = await installation(options);
        unlock = await lock(dir);
        const info = await inspect(dir, options);
        if (!info.hasUpdate) {
            result.success = true;
            result.output = info.message;
            result.commit = info.currentCommit;
            return result;
        }
        stage = mkdtempSync(join(dirname(dir), ".morningstar-update-"));
        candidate = join(stage, "candidate");
        options.onProgress?.(`Bereite Version ${info.latestVersion} separat vor …`);
        await git(dir, ["worktree", "add", "--quiet", "--detach", candidate, info.latestCommit], options.signal);
        worktree = true;
        if (!existsSync(join(candidate, "package-lock.json")))
            throw new UpdateError("Im Update fehlt package-lock.json.");
        const npm = npmInvocation();
        for (const [args, phase] of [
            [["ci", "--include=dev", "--no-audit", "--no-fund"], "Abhängigkeiten installieren"],
            [["run", "typecheck"], "Typprüfung"], [["run", "build"], "Build"],
        ]) {
            options.onProgress?.(`${phase} …`);
            await runUpdateProcess(npm.command, [...npm.args, ...args], candidate, phase, 600_000, options.signal);
        }
        const version = packageVersion(candidate);
        const smoke = await runUpdateProcess(process.execPath, [join(candidate, "bin", "morningstar.js"), "--version"], candidate, "Startprüfung", 30_000, options.signal);
        if (smoke.trim() !== version)
            throw new UpdateError("Die vorbereitete Version hat die Startprüfung nicht bestanden.");
        await requireClean(candidate);
        await requireClean(dir);
        if (await git(dir, ["rev-parse", "HEAD"]) !== info.currentCommit)
            throw new UpdateError("Die Installation wurde während des Updates geändert. Bitte erneut prüfen.", "blocked");
        if (await git(dir, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== info.branch
            || await git(dir, ["config", "--get", `branch.${info.branch}.remote`]) !== info.remote
            || await git(dir, ["config", "--get", `branch.${info.branch}.merge`]) !== info.upstreamRef) {
            throw new UpdateError("Der Update-Zweig wurde während der Vorbereitung geändert.", "blocked");
        }
        if (options.signal?.aborted)
            throw new UpdateError("Update abgebrochen; bisherige Installation beibehalten.");
        options.onProgress?.("Aktiviere die geprüfte Version …");
        // Finish activation if Ctrl+C arrives during the dependency swap/FF merge.
        if (existsSync(join(dir, "node_modules"))) {
            renameSync(join(dir, "node_modules"), join(stage, "previous-node_modules"));
            movedOld = true;
        }
        if (existsSync(join(candidate, "node_modules"))) {
            renameSync(join(candidate, "node_modules"), join(dir, "node_modules"));
            movedNew = true;
        }
        await git(dir, ["merge", "--ff-only", "--no-edit", info.latestCommit]);
        activated = result.changed = true;
        result.toVersion = getCurrentVersion(dir);
        result.commit = await git(dir, ["rev-parse", "HEAD"]);
        const installed = await runUpdateProcess(process.execPath, [join(dir, "bin", "morningstar.js"), "--version"], dir, "Prüfung der installierten Version", 30_000);
        if (result.commit !== info.latestCommit || installed.trim() !== version)
            throw new UpdateError("Die aktivierte Installation hat die Abschlussprüfung nicht bestanden.");
        result.success = true;
        result.output = "Update installiert und Start geprüft. Laufende Morningstar-Sitzungen bitte neu starten.";
    }
    catch (error) {
        result.output = errorMessage(error);
        if (dir && stage && (movedOld || movedNew)) {
            // Git can have finished despite a process error. Do not put old deps on a
            // newly activated revision. Never reset the user's repository.
            if (!activated) {
                try {
                    activated = result.changed = (await git(dir, ["rev-parse", "HEAD"])) === (await git(candidate, ["rev-parse", "HEAD"]));
                }
                catch {
                    retain = true;
                }
            }
            if (activated || retain) {
                retain = true;
                result.toVersion = getCurrentVersion(dir);
                result.output += ` Aktivierung unvollständig; Sicherung erhalten: ${stage}. Bitte Installation vor weiterer Nutzung prüfen.`;
            }
            else {
                try {
                    if (movedNew)
                        renameSync(join(dir, "node_modules"), join(candidate, "node_modules"));
                    if (movedOld)
                        renameSync(join(stage, "previous-node_modules"), join(dir, "node_modules"));
                    result.output += " Bisherige Abhängigkeiten wiederhergestellt.";
                }
                catch {
                    retain = true;
                    result.output += ` Wiederherstellung unvollständig; Sicherung erhalten: ${stage}.`;
                }
            }
        }
    }
    finally {
        if (stage && !retain) {
            try {
                if (worktree || existsSync(join(candidate, ".git")))
                    await git(dir, ["worktree", "remove", "--force", candidate]);
                rmSync(stage, { recursive: true, force: true });
            }
            catch {
                result.output += ` Temporäre Update-Dateien konnten nicht vollständig entfernt werden: ${stage}`;
            }
        }
        unlock?.();
        result.duration = Date.now() - start;
    }
    return result;
}
export function formatUpdateInfo(info) {
    return [`Version: ${info.currentVersion}${info.currentCommit ? ` (${info.currentCommit.slice(0, 8)})` : ""}`,
        ...(info.remote ? [`Zweig: ${info.remote}/${info.branch}`] : []),
        ...(info.hasUpdate ? [`Verfügbar: ${info.latestVersion} (${info.latestCommit?.slice(0, 8)})`] : []), info.message].join("\n");
}
export function formatUpdateResult(result) {
    return `${result.success ? "✓" : "✗"} ${result.output}\nVersion: ${result.fromVersion} → ${result.toVersion}${result.commit ? ` (${result.commit.slice(0, 8)})` : ""}`;
}
//# sourceMappingURL=self-update.js.map