export const rewindPoints = (messages) => messages.flatMap((m, index) => m.role === "user" && !m.contextKind ? [{ index, text: m.content }] : []);
export function rewindRange(messages, index, action) {
    if (!rewindPoints(messages).some(p => p.index === index))
        throw new Error("Ungültiger Rewind-Punkt.");
    const system = messages.filter(m => m.role === "system");
    const before = messages.slice(0, index).filter(m => m.role !== "system");
    const after = messages.slice(index).filter(m => m.role !== "system");
    if (action === "summarize-until")
        return { before: system, selected: before, after };
    return { before: [...system, ...before], selected: after, after: [] };
}
export async function rewindConversation(messages, index, action, summarize) {
    const range = rewindRange(messages, index, action);
    if (action === "restore")
        return { messages: range.before, draft: messages[index].content, ...(messages[index].images?.length ? { images: messages[index].images } : {}) };
    if (!range.selected.length)
        throw new Error("In diesem Bereich gibt es noch nichts zusammenzufassen.");
    const summary = (await summarize(range.selected)).trim();
    if (!summary)
        throw new Error("Keine Zusammenfassung erhalten. Der Verlauf bleibt unverändert.");
    return { messages: [...range.before, { role: "user", contextKind: "summary", content: `[Zusammengefasster Gesprächsverlauf]\n${summary}` }, ...range.after], draft: "" };
}
//# sourceMappingURL=rewind.js.map