const size = (m) => JSON.stringify(m).length;
const instruction = (m) => m.role === "user" && !m.contextKind && !m.content.startsWith("Tool results:\n");
/** Keep call IDs and exact arguments intact; only bound oversized result text in
 * the provider copy. A huge service list must not hide its entire current batch. */
function boundCurrentBatch(batch, budget) {
    const marker = "\n[Tool output shortened for request context; full result retained in session history. Missing details are not verified here.]\n";
    const atLimit = (limit) => batch.map(message => {
        if (message.role !== "tool" || message.content.length <= limit)
            return message;
        const room = limit - marker.length, head = Math.ceil(room * 0.7), tail = room - head;
        return { ...message, content: message.content.slice(0, head) + marker + (tail ? message.content.slice(-tail) : "") };
    });
    let low = marker.length + 120, high = Math.max(...batch.map(m => m.content.length));
    if (atLimit(low).reduce((n, m) => n + size(m), 0) > budget)
        return undefined;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (atLimit(mid).reduce((n, m) => n + size(m), 0) <= budget)
            low = mid;
        else
            high = mid - 1;
    }
    return atLimit(low);
}
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
    const copies = new Map();
    // Reserve a small summary first; recent evidence has priority over its summary.
    const summaryReserve = 1000;
    let remaining = maxChars - pinnedSize - summaryReserve - 500;
    for (let g = groups.length - 1; g >= 0; g--) {
        const group = groups[g];
        let weight = group.reduce((n, i) => n + size(messages[i]), 0);
        if (weight > remaining && g === groups.length - 1 && group[0] > (users.at(-1) ?? -1)
            && messages[group[0]].toolCalls?.length && messages[group.at(-1)].role === "tool") {
            const bounded = boundCurrentBatch(group.map(i => messages[i]), remaining);
            if (bounded) {
                group.forEach((i, index) => copies.set(i, bounded[index]));
                weight = bounded.reduce((n, m) => n + size(m), 0);
            }
        }
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
    const kept = messages.flatMap((message, i) => selected.has(i) ? [copies.get(i) ?? message] : []);
    const firstNonSystem = kept.findIndex((m) => m.role !== "system");
    if (omitted.length)
        kept.splice(firstNonSystem < 0 ? kept.length : firstNonSystem, 0, { role: "user", contextKind: "summary", content: summary });
    return { messages: kept, removedMessages: omitted.length };
}
//# sourceMappingURL=request-context.js.map