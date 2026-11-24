import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
/** Create from HEAD without disturbing a dirty working tree. Preserve on exit for review. */
export function createWorktreeSession(cwd, name = "session", storageRoot = join(homedir(), ".morningstar")) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name))
        throw new Error("Worktree name must be 1–64 letters, digits, dashes or underscores");
    const git = (args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }).trim();
    const repository = realpathSync(git(["rev-parse", "--show-toplevel"]));
    git(["rev-parse", "--verify", "HEAD"]);
    const hash = createHash("sha256").update(repository).digest("hex").slice(0, 16);
    const base = join(storageRoot, "worktrees", hash);
    for (const path of [storageRoot, join(storageRoot, "worktrees"), base]) {
        if (!existsSync(path))
            mkdirSync(path, { mode: 0o700 });
        const stat = lstatSync(path);
        if (stat.isSymbolicLink() || !stat.isDirectory())
            throw new Error("Worktree storage must be a real directory");
    }
    const suffix = randomBytes(6).toString("hex");
    const path = join(base, `${name}-${suffix}`);
    const branch = `morningstar/${name}-${suffix}`;
    git(["worktree", "add", "-b", branch, path, "HEAD"]);
    return { path, branch, repository };
}
//# sourceMappingURL=worktree-session.js.map