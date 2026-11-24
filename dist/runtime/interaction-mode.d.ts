import type { CLIConfig } from "../types.js";
import type { PermissionMode } from "../permissions.js";
export declare function cycleInteractionMode(current: PermissionMode, reverse?: boolean, disableBypass?: boolean, managed?: string): PermissionMode;
/** A mode switch must clear launch-time YOLO flags when leaving that mode. */
export declare function configForInteractionMode(config: CLIConfig, mode: PermissionMode): CLIConfig;
export declare function interactionModeLabel(mode: PermissionMode): string;
//# sourceMappingURL=interaction-mode.d.ts.map