// ─── Optional remote-agent bridge ─────────────────────────────────────────────
// The legacy tool name is kept for compatibility. It delegates one bounded task
// over SSH to a user-configured Hermes-compatible operator. No host, credential,
// account, or private infrastructure detail is stored in this repository.
//
// The task text is base64-encoded before crossing SSH to avoid quoting/newline
// breakage (a known gotcha with `hermes chat -q`).
import { execFileSync } from "node:child_process";
const DEFAULT_TIMEOUT_MS = 180_000;
const REMOTE_AGENT_HOST_ENV = "MORNINGSTAR_REMOTE_AGENT_HOST";
const SSH_DESTINATION = /^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,63}@)?[A-Za-z0-9](?:[A-Za-z0-9._-]{0,252}[A-Za-z0-9])?$/;
const realExec = (cmd, args, _input, timeoutMs) => execFileSync(cmd, args, { encoding: "utf-8", timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8 });
/**
 * Validate the deliberately narrow SSH destination format supported here:
 * an optional user plus a hostname, IPv4 address, or SSH config alias.
 * SSH options, whitespace, shell metacharacters, paths, and IPv6 literals are
 * rejected instead of being interpreted ambiguously.
 */
export function validateRemoteAgentHost(host) {
    if (!host) {
        throw new Error(`remote bridge disabled; set ${REMOTE_AGENT_HOST_ENV} in the trusted parent environment`);
    }
    if (host.length > 255 || !SSH_DESTINATION.test(host)) {
        throw new Error(`${REMOTE_AGENT_HOST_ENV} must be a plain SSH host or alias (optionally user@host)`);
    }
    return host;
}
/** Build the remote shell command that decodes the base64 task and runs Hermes. */
export function buildJerryCommand(task, host) {
    const destination = validateRemoteAgentHost(host);
    const b64 = Buffer.from(task, "utf-8").toString("base64");
    // On the remote host: decode the prompt, then run Hermes in quiet mode.
    const remote = `P=$(printf %s ${b64} | base64 -d); hermes chat -Q -q "$P"`;
    return ["--", destination, remote];
}
/**
 * Ask the configured remote operator to do something. Returns its reply text.
 * `exec` is injectable for tests. Throws on SSH/agent failure.
 */
export async function askJerry(task, timeoutMs = DEFAULT_TIMEOUT_MS, exec = realExec, host = process.env[REMOTE_AGENT_HOST_ENV]) {
    if (!task.trim())
        throw new Error("askJerry: leere Aufgabe");
    const args = buildJerryCommand(task, host ?? "");
    const out = exec("ssh", args, "", timeoutMs);
    return out.trim();
}
//# sourceMappingURL=jerry-bridge.js.map