import { execSync } from "node:child_process";
function exec(cmd, cwd) {
    try {
        return execSync(cmd, { cwd, encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }).trim();
    }
    catch (e) {
        const err = e;
        return (err.stdout || err.stderr || "").trim();
    }
}
export function isGitRepo(cwd) {
    try {
        execSync("git rev-parse --git-dir", { cwd, encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] });
        return true;
    }
    catch {
        return false;
    }
}
export function gitDiff(cwd, staged = false) {
    return exec(staged ? "git diff --staged" : "git diff", cwd);
}
export function gitLog(cwd, count = 10) {
    return exec(`git log --oneline -${count}`, cwd);
}
export function gitBranch(cwd) {
    const current = exec("git branch --show-current", cwd);
    const all = exec("git branch --no-color", cwd);
    const branches = all.split("\n").map(b => b.replace(/^\*?\s*/, "").trim()).filter(Boolean);
    return { current, branches };
}
export function gitStatusShort(cwd) {
    return exec("git status --short", cwd);
}
export function gitStatusFull(cwd) {
    return exec("git status", cwd);
}
export function gitAutoCommit(cwd, description) {
    try {
        const status = exec("git status --short", cwd);
        if (!status.trim())
            return { success: false, message: "Keine Aenderungen zum Committen." };
        execSync("git add -A", { cwd, encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
        const msg = `morningstar: ${description}`;
        execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd, encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] });
        const hash = exec("git rev-parse --short HEAD", cwd);
        return { success: true, message: msg, hash };
    }
    catch (e) {
        return { success: false, message: `Git Fehler: ${e.message.slice(0, 100)}` };
    }
}
export function generateCommitMessage(diff) {
    if (!diff.trim())
        return "chore: minor changes";
    const lines = diff.split("\n");
    const files = [];
    let hasNew = false;
    let hasDel = false;
    let hasTest = false;
    let hasDocs = false;
    let hasFix = false;
    for (const line of lines) {
        const fileMatch = line.match(/^diff --git a\/(.+?) b\//);
        if (fileMatch)
            files.push(fileMatch[1]);
        if (line.startsWith("new file"))
            hasNew = true;
        if (line.startsWith("deleted file"))
            hasDel = true;
        if (line.includes(".test.") || line.includes(".spec.") || line.includes("__tests__"))
            hasTest = true;
        if (line.includes("README") || line.includes("docs/") || line.includes(".md"))
            hasDocs = true;
        if (line.toLowerCase().includes("fix") || line.toLowerCase().includes("bug"))
            hasFix = true;
    }
    const fileNames = files.map(f => f.split("/").pop() || f).slice(0, 3);
    const fileStr = fileNames.join(", ");
    if (hasTest)
        return `test: update ${fileStr}`;
    if (hasDocs)
        return `docs: update ${fileStr}`;
    if (hasFix)
        return `fix: update ${fileStr}`;
    if (hasDel)
        return `chore: remove ${fileStr}`;
    if (hasNew)
        return `feat: add ${fileStr}`;
    return `refactor: update ${fileStr}`;
}
export function gitCreateBranch(cwd, name) {
    try {
        execSync(`git checkout -b "${name}"`, { cwd, encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
        return true;
    }
    catch {
        return false;
    }
}
export function gitStash(cwd, pop = false) {
    return exec(pop ? "git stash pop" : "git stash", cwd);
}
//# sourceMappingURL=git-integration.js.map