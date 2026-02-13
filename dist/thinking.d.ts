export type EffortLevel = "low" | "medium" | "high" | "ultra";
export interface ThinkingConfig {
    effortLevel: EffortLevel;
    enabled: boolean;
}
/**
 * Get current thinking config.
 */
export declare function getThinkingConfig(): ThinkingConfig;
/**
 * Set effort level.
 */
export declare function setEffortLevel(level: EffortLevel): void;
/**
 * Toggle extended thinking on/off.
 */
export declare function toggleThinking(): boolean;
/**
 * Disable extended thinking.
 */
export declare function disableThinking(): void;
/**
 * Get provider-specific thinking parameters.
 */
export declare function getThinkingParams(provider: string, model: string): Record<string, unknown>;
/**
 * Get a thinking instruction prefix for models without native thinking support.
 */
export declare function getThinkingPromptPrefix(): string;
/**
 * Get thinking status display.
 */
export declare function getThinkingStatus(): string;
//# sourceMappingURL=thinking.d.ts.map