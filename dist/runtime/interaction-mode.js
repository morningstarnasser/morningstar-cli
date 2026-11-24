export function cycleInteractionMode(current, reverse = false, disableBypass = false, managed) {
    if (managed)
        return current;
    const modes = disableBypass ? ["ask", "plan"] : ["ask", "plan", "bypassPermissions"];
    const index = modes.indexOf(current);
    return modes[(Math.max(0, index) + (reverse ? modes.length - 1 : 1)) % modes.length];
}
/** A mode switch must clear launch-time YOLO flags when leaving that mode. */
export function configForInteractionMode(config, mode) {
    if ((config.disableBypassPermissions && mode === "bypassPermissions") || (config.runtimeSettings?.managedPermissionMode && mode !== config.runtimeSettings.managedPermissionMode)) {
        throw new Error("Dieser Modus ist durch die verwalteten Einstellungen gesperrt.");
    }
    return { ...config, permissionMode: mode, yolo: mode === "bypassPermissions", dangerouslySkipPermissions: mode === "bypassPermissions" };
}
export function interactionModeLabel(mode) {
    return mode === "bypassPermissions" ? "YOLO" : mode === "plan" ? "Plan" : mode === "ask" ? "Normal" : mode;
}
//# sourceMappingURL=interaction-mode.js.map