export type VaultExec = (args: string[]) => string;
export type AsyncVaultExec = (args: string[], signal?: AbortSignal) => Promise<string>;
export declare const executeQmd: AsyncVaultExec;
/** Exclude private records before their snippets reach a model or diagnostic. */
export declare function publicVaultPath(input: string): string | null;
export declare function buildVaultArgs(sub: string, arg: string): string[] | null;
export interface VaultHit {
    file: string;
    title: string;
    snippet: string;
}
export declare function parseVaultHits(raw: string): VaultHit[];
export declare function runVaultCommand(command: string, exec?: VaultExec): string;
export declare function runVaultCommandAsync(command: string, signal?: AbortSignal, exec?: AsyncVaultExec): Promise<string>;
//# sourceMappingURL=vault.d.ts.map