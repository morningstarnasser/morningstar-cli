import type { CLIConfig } from "./types.js";
export interface ServerConfig {
    port: number;
    host: string;
    cliConfig: CLIConfig;
    corsEnabled: boolean;
    /** Required when binding beyond loopback. */
    authToken?: string;
    /** Exact browser origin allowed when CORS is enabled; wildcards are rejected. */
    corsOrigin?: string;
    /** Explicit opt-in for accepting server-local paths and returning local paths. */
    exposeLocalFilePaths?: boolean;
    maxBodyBytes?: number;
}
export declare const DEFAULT_PORT = 3000;
export declare const DEFAULT_HOST = "127.0.0.1";
export declare function startServer(config: ServerConfig): Promise<{
    close: () => void;
    port: number;
    url: string;
}>;
//# sourceMappingURL=server.d.ts.map