export type ExecFn = (cmd: string, args: string[], input: string, timeoutMs: number) => string;
/**
 * Validate the deliberately narrow SSH destination format supported here:
 * an optional user plus a hostname, IPv4 address, or SSH config alias.
 * SSH options, whitespace, shell metacharacters, paths, and IPv6 literals are
 * rejected instead of being interpreted ambiguously.
 */
export declare function validateRemoteAgentHost(host: string): string;
/** Build the remote shell command that decodes the base64 task and runs Hermes. */
export declare function buildJerryCommand(task: string, host: string): string[];
/**
 * Ask the configured remote operator to do something. Returns its reply text.
 * `exec` is injectable for tests. Throws on SSH/agent failure.
 */
export declare function askJerry(task: string, timeoutMs?: number, exec?: ExecFn, host?: string | undefined): Promise<string>;
//# sourceMappingURL=jerry-bridge.d.ts.map