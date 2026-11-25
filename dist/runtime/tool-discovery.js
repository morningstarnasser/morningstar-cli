const words = (text) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2);
const stop = new Set(["the", "and", "for", "with", "this", "that", "die", "der", "das", "den", "dem", "und", "mir", "gib", "bitte", "von", "mit", "telegram"]);
/** Retrieval ranks discovery only. Execution always keeps the normal tool policy. */
export function rankTools(tools, query) {
    const queryWords = [...new Set(words(query).filter(word => !stop.has(word)))];
    return tools.map((tool, order) => {
        const names = new Set(words(tool.name)), description = tool.description.toLowerCase();
        const score = queryWords.reduce((n, word) => n + (names.has(word) ? 8 : description.includes(word) ? 1 : 0), 0)
            + (query.includes(tool.name) ? 1000 : 0);
        return { tool, score, order };
    }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.order - b.order).map(entry => entry.tool);
}
/** Large MCP registries are discovered on demand. Do not duplicate every schema
 * on every turn of a small-context local model. All selected schemas stay exact. */
export function selectRequestTools(tools, messages) {
    if (JSON.stringify(tools).length <= 48000 || !tools.some(tool => tool.function.name === "tool_search"))
        return tools;
    const core = tools.filter(tool => !tool.function.name.startsWith("mcp__"));
    const mcp = tools.filter(tool => tool.function.name.startsWith("mcp__"));
    let currentTask = messages.length - 1;
    while (currentTask >= 0 && (messages[currentTask].role !== "user" || messages[currentTask].contextKind))
        currentTask--;
    const recent = messages.slice(Math.max(0, currentTask));
    const searches = recent.flatMap(message => message.toolCalls ?? []).filter(call => call.name === "tool_search");
    const query = typeof searches.at(-1)?.arguments.query === "string" ? searches.at(-1).arguments.query : messages[currentTask]?.content ?? "";
    const ranked = rankTools(mcp.map(tool => ({ ...tool.function, definition: tool })), query);
    const prior = new Set(recent.flatMap(message => message.toolCalls?.map(call => call.name) ?? []).slice(-4));
    const candidates = [...ranked.map(tool => tool.definition), ...mcp.filter(tool => prior.has(tool.function.name))];
    const selected = [...core], names = new Set(core.map(tool => tool.function.name));
    let bytes = JSON.stringify(core).length, count = 0;
    for (const tool of candidates) {
        if (names.has(tool.function.name))
            continue;
        const size = JSON.stringify(tool).length;
        if (count >= 8 || bytes + size > 48000)
            continue;
        selected.push(tool);
        names.add(tool.function.name);
        bytes += size;
        count++;
    }
    return selected;
}
//# sourceMappingURL=tool-discovery.js.map