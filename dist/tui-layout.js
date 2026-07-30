export function normalizeTerminalColumns(columns) {
    if (!Number.isFinite(columns) || !columns || columns < 20)
        return 80;
    return Math.floor(columns);
}
export function getTerminalDensity(columns) {
    const width = normalizeTerminalColumns(columns);
    if (width < 72)
        return "compact";
    if (width < 104)
        return "comfortable";
    return "wide";
}
export function getProviderLocation(provider) {
    if (provider === "ollama" || provider === "hydra-local")
        return "local";
    if (provider === "claude-cli")
        return "subscription";
    return "hosted";
}
export function fitText(value, maxLength) {
    if (maxLength <= 0)
        return "";
    if (value.length <= maxLength)
        return value;
    if (maxLength <= 3)
        return "…".slice(0, maxLength);
    const remaining = maxLength - 1;
    const startLength = Math.ceil(remaining / 2);
    const endLength = Math.floor(remaining / 2);
    return `${value.slice(0, startLength)}…${value.slice(value.length - endLength)}`;
}
export function composerRule(columns) {
    const width = normalizeTerminalColumns(columns);
    return "─".repeat(Math.max(20, width - 2));
}
export function suggestionLimit(columns) {
    const density = getTerminalDensity(columns);
    if (density === "compact")
        return 6;
    if (density === "comfortable")
        return 8;
    return 10;
}
//# sourceMappingURL=tui-layout.js.map