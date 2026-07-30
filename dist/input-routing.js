export function classifyLocalInput(input, runContext = {}) {
    if (runContext.promptTemplate)
        return "prompt";
    if (input.startsWith("/"))
        return "slash";
    if (input.startsWith("!") && input.length > 1)
        return "bang";
    const trimmed = input.trim();
    if (trimmed === "cd" || /^cd\s+/.test(trimmed))
        return "cd";
    return "prompt";
}
//# sourceMappingURL=input-routing.js.map