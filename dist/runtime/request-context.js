const size = (m) => JSON.stringify(m).length;
const instruction = (m) => m.role === "user" && !m.contextKind && !m.content.startsWith("Tool results:\n");
/**
 * Bound each provider request, not the stored transcript. Native call/result
 * batches are indivisible. Keep system rules and the first/latest user task.
 * Extractive history is explicitly labelled; original evidence stays in history.
 */
export function compactRequest(messages, maxChars = 60000) {
    if (!Number.isSafeInteger(maxChars) || maxChars < 4000)
        throw new Error("Context budget must be at least 4000 characters");
    if (messages.length <= 64 && messages.reduce((n, m) => n + size(m), 0) <= maxChars)
        return { messages: [...messages], removedMessages: 0 };
    const users = messages.map((m, i) => instruction(m) ? i : -1).filter((i) => i >= 0);
    const pinned = new Set(messages.map((m, i) => m.role === "system" ? i : -1).filter((i) => i >= 0));
    if (users.length) {
        pinned.add(users[0]);
        pinned.add(users.at(-1));
    }
    const pinnedSize = [...pinned].reduce((n, i) => n + size(messages[i]), 0);
    if (pinnedSize > maxChars - 1500)
        throw new Error("System instructions and current task exceed the context budget. Increase --context-chars or shorten the input.");
    const groups = [];
    for (let i = 0; i < messages.length; i++) {
        if (pinned.has(i))
            continue;
        const group = [i];
        if (messages[i].role === "assistant" && messages[i].toolCalls?.length) {
            while (messages[i + 1]?.role === "tool")
                group.push(++i);
        }
        // Never send an orphan result in a resumed transcript.
        if (messages[group[0]].role !== "tool")
            groups.push(group);
    }
    const selected = new Set(pinned);
    // Reserve a small summary first; recent evidence has priority over its summary.
    const summaryReserve = 1000;
    let remaining = maxChars - pinnedSize - summaryReserve - 500;
    for (let g = groups.length - 1; g >= 0; g--) {
        const group = groups[g];
        const weight = group.reduce((n, i) => n + size(messages[i]), 0);
        if (weight > remaining || selected.size + group.length > 48)
            break;
        for (const i of group)
            selected.add(i);
        remaining -= weight;
    }
    const summaryBudget = Math.min(6000, remaining + summaryReserve);
    const omitted = messages.filter((_, i) => !selected.has(i));
    const excerpt = (m) => {
        const calls = m.toolCalls?.map((t) => `${t.name}(${JSON.stringify(t.arguments).slice(0, 220)})`).join("; ") ?? "";
        const text = m.content.length > 400 ? m.content.slice(0, 240) + " … " + m.content.slice(-150) : m.content;
        return `${m.role}${m.toolName ? `/${m.toolName}` : ""}${m.isError ? " ERROR" : ""}: ${calls} ${text}`;
    };
    const header = `[Earlier context condensed: ${omitted.length} messages. Excerpts, not complete evidence. Full transcript is retained; re-read files or sources when details are needed.]\n`;
    let summary = header;
    // Preserve the opening context and the newest omitted outcomes within budget.
    const first = omitted.slice(0, 2).map(excerpt).join("\n").slice(0, Math.floor(summaryBudget / 4));
    const tailBudget = summaryBudget - header.length - first.length - 30;
    const tailParts = [];
    let tailLength = 0;
    for (let i = omitted.length - 1; i >= 2 && tailLength < tailBudget; i--) {
        const part = excerpt(omitted[i]);
        tailParts.push(part);
        tailLength += part.length + (tailParts.length > 1 ? 1 : 0);
    }
    const tail = tailParts.reverse().join("\n").slice(-tailBudget);
    summary += first + "\n[…]\n" + tail;
    const kept = messages.filter((_, i) => selected.has(i));
    const firstNonSystem = kept.findIndex((m) => m.role !== "system");
    kept.splice(firstNonSystem < 0 ? kept.length : firstNonSystem, 0, { role: "user", contextKind: "summary", content: summary });
    return { messages: kept, removedMessages: omitted.length };
}
//# sourceMappingURL=request-context.js.map