// ─── Safety Gate — destructive command classifier + guard hook ───────────────
// A remote bash agent (Telegram) is powerful and dangerous. Before executing a
// shell command, `bash()` consults the registered guard. By default no guard is
// set, so the interactive CLI is unchanged. The Telegram gateway installs a
// guard that blocks destructive commands until the user approves them with a
// button — Hermes refuses money/deploy/delete in fallback; we go further and
// gate every destructive op on an untrusted remote channel.
let guard = null;
/** Install (or clear with null) the command guard. */
export function setCommandGuard(g) {
    guard = g;
}
/** Consulted by bash() before executing. No guard installed → allow. */
export function checkCommand(cmd) {
    if (!guard)
        return { allow: true };
    try {
        return guard(cmd);
    }
    catch {
        return { allow: false, reason: "command guard failed closed" };
    }
}
// Ordered, specific → general. Each pattern marks a command as destructive.
const RULES = [
    { test: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-rf|-fr)\b/i, reason: "rekursives Löschen (rm -rf)" },
    { test: /\brm\s+-[a-z]*r\b.*(\/$|\/\s|\s\/|\*)/i, reason: "rekursives Löschen weiter Pfade" },
    { test: /\b(mkfs|fdisk|parted)\b/i, reason: "Dateisystem/Partition" },
    { test: /\bdd\b[^|]*\bof=\/dev\//i, reason: "dd auf ein Gerät" },
    { test: />\s*\/dev\/(sd|nvme|disk)/i, reason: "Schreiben auf ein Blockgerät" },
    { test: /:\(\)\s*\{.*\|.*&\s*\}\s*;/, reason: "Fork-Bomb" },
    { test: /\bchmod\s+-R\s+0*777\s+\//i, reason: "chmod -R 777 auf /" },
    { test: /\bchown\s+-R\b.*\s\//i, reason: "rekursives chown auf /" },
    { test: /\b(shutdown|reboot|halt|poweroff)\b/i, reason: "System herunterfahren/neustarten" },
    { test: /\bkill(all)?\s+-9?\s*-1\b/i, reason: "alle Prozesse killen" },
    { test: /\bgit\s+push\b.*(--force|-f)\b/i, reason: "git force-push" },
    { test: /\bgit\s+reset\s+--hard\b/i, reason: "git reset --hard (Änderungen verwerfen)" },
    { test: /\bgit\s+clean\s+-[a-z]*f/i, reason: "git clean -f (untracked löschen)" },
    { test: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/i, reason: "Download-Pipe-to-Shell" },
    { test: /\bsudo\b/i, reason: "sudo (erhöhte Rechte)" },
    { test: /\b(drop\s+table|drop\s+database|truncate\s+table|delete\s+from)\b/i, reason: "destruktives SQL" },
    { test: /\bnpm\s+publish\b/i, reason: "npm publish" },
    { test: /\bfind\b[^|]*-delete\b/i, reason: "find -delete" },
    { test: /\b(docker\s+system\s+prune|docker\s+rm\s+-f|docker\s+volume\s+rm)\b/i, reason: "Docker-Ressourcen löschen" },
    { test: /\b(coolify|vercel|railway|fly)\s+deploy\b/i, reason: "Deployment" },
];
/** Classify a shell command. Pure + heavily tested. */
export function classifyCommand(cmd) {
    const c = cmd.trim();
    for (const rule of RULES) {
        if (rule.test.test(c))
            return { destructive: true, reason: rule.reason };
    }
    return { destructive: false, reason: "" };
}
const SIMPLE_READ_ONLY = /^(ls|cat|head|tail|pwd|echo|grep|stat|file|wc|diff|which|whoami)\b/i;
// Automatic read-only approval is intentionally limited to commands whose raw
// text does not require shell parsing. Quoting, escaping, substitutions,
// grouping, redirects, separators, and newlines all fall back to approval.
const COMPLEX_SHELL_SYNTAX = /[\r\n|><;&$`\\'"()[\]{}*?~]/;
function isReadOnlyRipgrep(command) {
    if (!/^rg(?:\s|$)/i.test(command))
        return false;
    return !/(?:^|\s)--(?:pre|hostname-bin)(?:=|\s|$)/i.test(command);
}
/** True if the command only reads/inspects (no mutation). Conservative. */
export function isReadOnlyCommand(cmd) {
    const c = cmd.trim();
    if (classifyCommand(c).destructive)
        return false;
    if (!c || COMPLEX_SHELL_SYNTAX.test(c))
        return false;
    if (SIMPLE_READ_ONLY.test(c))
        return true;
    if (isReadOnlyRipgrep(c))
        return true;
    // Git can execute repository-configured helpers (for example fsmonitor or
    // external diff drivers), so shell-based git calls require approval. The
    // dedicated `git` tool uses a constrained argv executor instead.
    if (/^node\s+(?:--version|-v)$/i.test(c))
        return true;
    if (/^date(?:\s+(?:-u|\+\S+))*$/i.test(c))
        return true;
    return false;
}
//# sourceMappingURL=safety.js.map