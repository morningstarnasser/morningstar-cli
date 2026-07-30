export type VaultExec = (args: string[]) => string;
/** Build the qmd argv for a vault subcommand. Pure + testable. */
export declare function buildVaultArgs(sub: string, arg: string): string[] | null;
/**
 * Handle a `<tool:vault>...</tool>` argument: "search <q>", "vsearch <q>",
 * "get <path>". Returns vault text for the agent.
 */
export declare function runVaultCommand(arg: string, exec?: VaultExec): string;
//# sourceMappingURL=vault.d.ts.map