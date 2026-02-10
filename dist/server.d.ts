import type { CLIConfig } from "./types.js";
export interface ServerConfig {
    port: number;
    host: string;
    cliConfig: CLIConfig;
    corsEnabled: boolean;
}
export declare const DEFAULT_PORT = 3000;
export declare const DEFAULT_HOST = "0.0.0.0";
export declare function startServer(config: ServerConfig): Promise<{
    close: () => void;
    port: number;
    url: string;
}>;
//# sourceMappingURL=server.d.ts.map