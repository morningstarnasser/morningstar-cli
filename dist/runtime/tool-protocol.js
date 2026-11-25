/** Detect unfinished invocation lines, including after a preamble. Never execute
 * guessed arguments or interpret quoted examples as requests. */
export function isMalformedToolAttempt(text) {
    if (text.length > 200_000)
        return false;
    let fence = "";
    const lines = text.split("\n").map(line => {
        const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (marker) {
            if (!fence)
                fence = marker[1];
            else if (marker[1][0] === fence[0] && marker[1].length >= fence.length)
                fence = "";
            return "";
        }
        return fence || /^\s*>/.test(line) ? "" : line;
    }).join("\n");
    const remainder = lines.replace(/<tool:\w+>[\s\S]*?<\/tool(?::\w+)?>/g, "");
    return /^[ \t]*(?:<)?tool:[a-zA-Z0-9_]+(?:>|\s|\{)/m.test(remainder);
}
//# sourceMappingURL=tool-protocol.js.map