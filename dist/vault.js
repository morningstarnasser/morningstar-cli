// ─── Superbrain — Obsidian vault search via qmd ──────────────────────────────
// Optional "superbrain": QMD over a user-configured Obsidian vault.
// <tool:vault>search <q> | vsearch <q> | get <path></tool>. qmd lives in
// ~/.local/bin and its shebang needs bun (~/.bun/bin) on PATH — the launchd
// daemon's PATH lacks both, so we always run qmd with an augmented PATH.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
const COLLECTION = "obsidian";
function augmentedPath() {
    const home = homedir();
    return `${home}/.bun/bin:${home}/.local/bin:${process.env.PATH ?? ""}`;
}
const realExec = (args) => execFileSync("qmd", args, {
    encoding: "utf-8",
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 5,
    env: { ...process.env, PATH: augmentedPath() },
});
/** Build the qmd argv for a vault subcommand. Pure + testable. */
export function buildVaultArgs(sub, arg) {
    switch (sub) {
        case "search":
            return ["search", arg, "-c", COLLECTION];
        case "vsearch":
            return ["vsearch", arg, "-c", COLLECTION];
        case "get":
            return ["get", arg.startsWith("qmd://") ? arg : `qmd://${COLLECTION}/${arg.replace(/^\/+/, "")}`];
        default:
            return null;
    }
}
/**
 * Handle a `<tool:vault>...</tool>` argument: "search <q>", "vsearch <q>",
 * "get <path>". Returns vault text for the agent.
 */
export function runVaultCommand(arg, exec = realExec) {
    const trimmed = arg.trim();
    const spaceIdx = trimmed.indexOf(" ");
    const sub = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase() || "search";
    const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
    // Bare "<tool:vault>some query</tool>" → treat as a search.
    const args = buildVaultArgs(sub, rest) ?? buildVaultArgs("search", trimmed);
    if (!args)
        return "Nutzung: <tool:vault>search <query></tool> · vsearch <query> · get <pfad>";
    try {
        const out = exec(args).trim();
        return out ? out.slice(0, 6000) : "Nichts im Vault gefunden.";
    }
    catch (e) {
        return `Vault-Fehler: ${e.message}`;
    }
}
//# sourceMappingURL=vault.js.map