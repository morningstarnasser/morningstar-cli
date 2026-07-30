import { type SessionCosts } from "./cost-tracker.js";
import { toolStats } from "./tools.js";
import type { Message, CLIConfig } from "./types.js";
export interface DashboardConfig {
    port: number;
    host?: "127.0.0.1" | "::1";
    cliConfig: CLIConfig;
    getMessages: () => Message[];
    getSessionStart: () => number;
    openBrowser?: boolean;
}
export interface DashboardState {
    isRunning: boolean;
    port: number;
    url: string;
    accessUrl: string;
    stop: () => Promise<void>;
}
export declare function generateDashboardHTML(config: CLIConfig, costs: SessionCosts, stats: typeof toolStats, messages: Message[], sessionStart: number): string;
export declare function escapeHtml(text: string): string;
/**
 * Start the web dashboard server.
 */
export declare function startDashboard(dashConfig: DashboardConfig): Promise<DashboardState>;
/**
 * Format dashboard status for terminal display.
 */
export declare function formatDashboardStatus(state: DashboardState): string;
//# sourceMappingURL=web-dashboard.d.ts.map