function isMetricsRead(result) {
    if (!/^mcp__.+__entity_status(?:__[a-f0-9]+)?$/i.test(result.tool))
        return false;
    try {
        const value = JSON.parse(result.result.split("\n")[0]);
        return typeof value?.entity === "string"
            && typeof value?.observed_at === "string"
            && typeof value?.data?.uptime_seconds === "number"
            && typeof value?.display?.uptime === "string";
    }
    catch {
        return false;
    }
}
/** Narrow guard for the observed German blanket-health conclusion after metrics-only
 * reads. It is not a general fact checker; raw model deltas remain unchanged. */
export function scopeStatusConclusion(text, results) {
    const evidence = results.filter(result => result.success && result.tool !== "tool_search");
    if (!evidence.length || !evidence.every(isMetricsRead))
        return text;
    let fence;
    return text.split("\n").map(line => {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
        if (marker) {
            if (!fence)
                fence = { char: marker[1][0], length: marker[1].length };
            else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !line.slice(marker[0].length).trim())
                fence = undefined;
            return line;
        }
        if (fence)
            return line;
        const claim = line.match(/^\s*(?:\*\*)?(?:Alles im grünen Bereich|Alles gesund|Alle Dienste laufen)(?:\*\*)?[.!]?(?:\*\*)?(?=\s*(?:$|[—–:;,\-]))/iu);
        if (!claim)
            return line;
        const explanation = line.slice(claim[0].length).trimEnd();
        return `Die Einschätzung betrifft nur die gemessenen Werte${explanation.trim() ? explanation : "."}\n\nEs liegt keine vollständige Dienstprüfung vor.`;
    }).join("\n");
}
//# sourceMappingURL=status-grounding.js.map