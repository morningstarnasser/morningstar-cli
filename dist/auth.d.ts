export type AuthKind = "subscription" | "api-key" | "local";
/** Resolved usability of an auth option, worst-first when rendering. */
export type AuthState = "ready" | "logged-out" | "cli-missing" | "key-missing";
export interface VendorCli {
    /** Executable name, resolved via PATH. */
    bin: string;
    /** Arguments that report login state without side effects. */
    statusArgs: string[];
    /** Arguments that start the vendor's interactive OAuth login. */
    loginArgs: string[];
    /** Arguments that drop the stored session. */
    logoutArgs: string[];
    /** Human-readable command shown when we cannot run the login ourselves. */
    loginHint: string;
}
export interface AuthOption {
    /** Stable id, e.g. "claude:subscription". */
    id: string;
    /** Vendor grouping shown in the picker, e.g. "Claude". */
    vendor: string;
    kind: AuthKind;
    /** Provider name in the model registry this option unlocks. */
    provider: string;
    /** Row label, e.g. "Abo · Claude Code (OAuth)". */
    label: string;
    /** Model selected after a successful login. */
    defaultModel: string;
    cli?: VendorCli;
    /** Environment variable consulted for api-key options. */
    envKey?: string;
}
/**
 * Every way to authenticate, grouped by vendor. Subscription options come
 * before their api-key sibling: using an existing plan is cheaper than paying
 * per token.
 */
export declare const AUTH_OPTIONS: readonly AuthOption[];
export interface CliProbeResult {
    /** True when the CLI reports an active session. */
    loggedIn: boolean;
    /** True when the executable could not be run at all. */
    missing: boolean;
    /** Short human-readable detail, e.g. an account email or plan. */
    detail: string;
}
/**
 * Interpret a vendor CLI's status output.
 *
 * `claude auth status` prints JSON to stdout. `codex login status` prints a
 * sentence to *stderr* and leaves stdout empty, so callers pass both streams
 * combined and the exit code carries the real signal: status commands exit 0
 * only when a session exists.
 */
export declare function parseCliStatus(bin: string, output: string, exitOk?: boolean): CliProbeResult;
export interface CliStatusOutput {
    /** stdout and stderr combined — vendors disagree on which one they use. */
    output: string;
    /** True when the command exited 0. */
    ok: boolean;
}
/** Runs a vendor CLI status command. Injectable so tests never spawn. */
export type CliStatusRunner = (bin: string, args: string[]) => CliStatusOutput;
/** Ask a vendor CLI whether it holds a session. Never throws. */
export declare function probeCliAuth(cli: VendorCli, runner?: CliStatusRunner): CliProbeResult;
/**
 * Non-blocking probe. The interactive UI must not freeze for the second or two
 * a vendor CLI needs to answer, so the picker uses this variant and the two
 * vendor probes run concurrently.
 */
export declare function probeCliAuthAsync(cli: VendorCli): Promise<CliProbeResult>;
export interface AuthOptionState {
    option: AuthOption;
    state: AuthState;
    detail: string;
}
export interface AuthResolveDeps {
    /** Stored or environment API key for a provider; "" when absent. */
    getStoredApiKey: (provider: string) => string;
    /** Probe used for subscription options. */
    probe?: (cli: VendorCli) => CliProbeResult;
}
/** Resolve one option's usability. */
export declare function resolveAuthOption(option: AuthOption, deps: AuthResolveDeps): AuthOptionState;
export interface AuthVendorGroup {
    vendor: string;
    options: AuthOptionState[];
    /** True when at least one option of this vendor is usable. */
    ready: boolean;
}
/** Resolve every option and group by vendor, preserving catalog order. */
export declare function resolveAuthGroups(deps: AuthResolveDeps, options?: readonly AuthOption[]): AuthVendorGroup[];
/**
 * Async twin of `resolveAuthGroups`: probes every distinct vendor CLI once, in
 * parallel, then resolves the catalog against those results.
 */
export declare function resolveAuthGroupsAsync(deps: Omit<AuthResolveDeps, "probe">, options?: readonly AuthOption[]): Promise<AuthVendorGroup[]>;
/** Short badge for a state, used by the picker. */
export declare function authStateBadge(state: AuthState): string;
/** Look up an option by id. */
export declare function findAuthOption(id: string): AuthOption | undefined;
/** Options that unlock a given registry provider. */
export declare function authOptionsForProvider(provider: string): AuthOption[];
//# sourceMappingURL=auth.d.ts.map