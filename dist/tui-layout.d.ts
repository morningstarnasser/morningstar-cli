export type TerminalDensity = "compact" | "comfortable" | "wide";
export type ProviderLocation = "local" | "hosted" | "subscription";
export declare function normalizeTerminalColumns(columns?: number): number;
export declare function getTerminalDensity(columns?: number): TerminalDensity;
export declare function getProviderLocation(provider: string): ProviderLocation;
export declare function fitText(value: string, maxLength: number): string;
export declare function composerRule(columns?: number): string;
export declare function suggestionLimit(columns?: number): number;
//# sourceMappingURL=tui-layout.d.ts.map