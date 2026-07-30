// ─── Verification Loop (#2) ──────────────────────────────────────────────────
// Jerry's review: a coding agent must prove its work. This detects the project's
// real check commands (from package.json scripts) and runs them, plus a cheap
// git diff summary, so Carry can verify after editing and report pass/fail —
// "done" only when verified. The `<tool:verify>` tool exposes this to the agent.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * Choose verification commands from a package.json scripts map. Pure + testable.
 * Prefers fast checks (typecheck/lint) and includes test/build if present.
 */
export function pickChecks(scripts) {
    const checks = [];
    const want = [
        ["typecheck", "npm run typecheck"],
        ["lint", "npm run lint"],
        ["test", "npm test"],
        ["build", "npm run build"],
    ];
    for (const [name, command] of want) {
        if (scripts[name])
            checks.push({ name, command });
    }
    return checks;
}
/** Detect checks for a project directory (reads package.json). */
export function detectChecks(cwd) {
    const pkgPath = join(cwd, "package.json");
    if (!existsSync(pkgPath))
        return [];
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        return pickChecks(pkg.scripts ?? {});
    }
    catch {
        return [];
    }
}
function run(command, cwd, timeoutMs) {
    try {
        const out = execSync(command, { cwd, encoding: "utf-8", timeout: timeoutMs, maxBuffer: 1024 * 1024 * 5, stdio: ["pipe", "pipe", "pipe"] });
        return { ok: true, output: out.slice(-1500) };
    }
    catch (e) {
        const err = e;
        return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}`.slice(-1500) || err.message };
    }
}
/** Run all detected checks and a git diff summary. Returns per-check results. */
export function verifyProject(cwd, timeoutMs = 180_000) {
    const checks = detectChecks(cwd).map((c) => ({ name: c.name, ...run(c.command, cwd, timeoutMs) }));
    let diff = "";
    try {
        diff = execSync("git diff --stat 2>/dev/null | tail -20", { cwd, encoding: "utf-8", timeout: 10000 }).trim();
    }
    catch {
        /* not a git repo */
    }
    return { checks, diff };
}
/** Render a compact verification report for Telegram. */
export function formatVerification(result) {
    if (result.checks.length === 0 && !result.diff)
        return "Keine Checks gefunden (kein package.json / git).";
    const lines = result.checks.map((c) => `${c.ok ? "✅" : "❌"} ${c.name}`);
    const failed = result.checks.filter((c) => !c.ok);
    let out = `🔎 Verifikation: ${lines.join("  ") || "(keine npm-Checks)"}`;
    if (result.diff)
        out += `\n\n\`\`\`\n${result.diff}\n\`\`\``;
    if (failed.length)
        out += `\n\n❌ ${failed[0].name}:\n${failed[0].output.slice(-600)}`;
    return out;
}
//# sourceMappingURL=verification.js.map