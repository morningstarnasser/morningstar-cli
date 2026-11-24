import type { CLIConfig } from "../types.js";
import type { PermissionMode } from "../permissions.js";

export function cycleInteractionMode(current: PermissionMode, reverse = false, disableBypass = false, managed?: string): PermissionMode {
  if (managed) return current;
  const modes: PermissionMode[] = disableBypass ? ["ask", "plan"] : ["ask", "plan", "bypassPermissions"];
  const index = modes.indexOf(current);
  return modes[(Math.max(0, index) + (reverse ? modes.length - 1 : 1)) % modes.length];
}

/** A mode switch must clear launch-time YOLO flags when leaving that mode. */
export function configForInteractionMode(config: CLIConfig, mode: PermissionMode): CLIConfig {
  if ((config.disableBypassPermissions && mode === "bypassPermissions") || (config.runtimeSettings?.managedPermissionMode && mode !== config.runtimeSettings.managedPermissionMode)) {
    throw new Error("Dieser Modus ist durch die verwalteten Einstellungen gesperrt.");
  }
  return { ...config, permissionMode: mode, yolo: mode === "bypassPermissions", dangerouslySkipPermissions: mode === "bypassPermissions" };
}

export function interactionModeLabel(mode: PermissionMode): string {
  return mode === "bypassPermissions" ? "YOLO" : mode === "plan" ? "Plan" : mode === "ask" ? "Normal" : mode;
}
