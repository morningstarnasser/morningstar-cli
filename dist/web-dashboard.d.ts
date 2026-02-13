import type { Message, CLIConfig } from "./types.js";
export interface DashboardConfig {
    port: number;
    host: string;
    cliConfig: CLIConfig;
    getMessages: () => Message[];
    getSessionStart: () => number;
}
export interface DashboardState {
    isRunning: boolean;
    port: number;
    url: string;
}
/**
 * Start the web dashboard server.
 */
export declare function startDashboard(dashConfig: DashboardConfig): Promise<DashboardState>;
/**
 * Format dashboard status for terminal display.
 */
export declare function formatDashboardStatus(state: DashboardState): string;
//# sourceMappingURL=web-dashboard.d.ts.map