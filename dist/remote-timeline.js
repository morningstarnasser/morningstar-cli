import { displayText, fileChange, workHeading } from "./runtime/work-log.js";
/** Explicit allowlist: auth output, pairing secrets, reasoning and internal UI never leave the terminal. */
export function remoteTimeline(output) {
    return output.flatMap((item) => {
        const id = String(item.id);
        if (item.type === "text" && item.content?.startsWith("> "))
            return [{ id, kind: "message", role: "user", content: displayText(item.content.slice(2)).slice(0, 32000) }];
        if (item.type === "ai-response" && item.streamingText?.trim())
            return [{ id, kind: "message", role: "assistant", content: displayText(item.streamingText).slice(0, 64000) }];
        if (item.type === "notice")
            return [{ id, kind: "notice", content: displayText(item.content ?? "").slice(0, 16000) }];
        if (item.type !== "work-log")
            return [];
        return (item.toolResults ?? []).map((r, index) => ({ id: `${id}:${index}`, kind: "work", work: { agent: item.toolLabel ?? "morningstar", heading: displayText(workHeading(r)), success: r.success, output: displayText(r.result).slice(0, 16000), change: r.diff ? fileChange(r.diff.oldStr, r.diff.newStr) : undefined } }));
    }).slice(-300);
}
//# sourceMappingURL=remote-timeline.js.map