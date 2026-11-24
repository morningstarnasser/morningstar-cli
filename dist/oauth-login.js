import { vendorCommand } from "./runtime/platform-process.js";
// ─── Vendor OAuth login ──────────────────────────────────────────────────────
// Morningstar deliberately implements no OAuth of its own. Signing in to Claude
// or ChatGPT means handing control to that vendor's official CLI, which owns
// the client id, the browser round-trip and the token storage. We only start it
// and read the exit code.
//
// The child inherits the terminal so its browser prompt and device code are
// visible. The caller must release Ink's raw-mode grip on stdin first (see
// `withSuspendedInk`), otherwise the child never sees a keystroke.
import { spawn } from "node:child_process";
const defaultSpawner = (bin, args) => new Promise((resolvePromise, rejectPromise) => {
    const executable = vendorCommand(bin, args);
    const child = spawn(executable.file, executable.args, { stdio: "inherit" });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise(code ?? 0));
});
/**
 * Run a vendor's interactive OAuth login to completion.
 *
 * Never throws: a missing binary or a user-aborted flow comes back as a failed
 * result so the caller can render it as a normal message.
 */
export async function runVendorLogin(cli, spawner = defaultSpawner) {
    try {
        const code = await spawner(cli.bin, cli.loginArgs);
        return code === 0
            ? { ok: true, detail: `${cli.bin}: Anmeldung abgeschlossen.` }
            : { ok: false, detail: `${cli.bin} beendet mit Code ${code}. Abgebrochen?` };
    }
    catch (error) {
        const code = error.code;
        if (code === "ENOENT") {
            return { ok: false, detail: `${cli.bin} ist nicht installiert.` };
        }
        return { ok: false, detail: `${cli.bin}: ${error.message}` };
    }
}
/** Run a vendor's logout. Same never-throws contract as `runVendorLogin`. */
export async function runVendorLogout(cli, spawner = defaultSpawner) {
    try {
        const code = await spawner(cli.bin, cli.logoutArgs);
        return code === 0
            ? { ok: true, detail: `${cli.bin}: abgemeldet.` }
            : { ok: false, detail: `${cli.bin} beendet mit Code ${code}.` };
    }
    catch (error) {
        return { ok: false, detail: `${cli.bin}: ${error.message}` };
    }
}
//# sourceMappingURL=oauth-login.js.map