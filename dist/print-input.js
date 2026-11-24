const MAX_INPUT = 8 * 1024 * 1024;
export function parseUserInput(line) {
    const value = JSON.parse(line);
    const message = value?.message;
    if (value?.type !== "user" || !message || message.role !== "user")
        throw new Error("stream-json input must contain user messages only");
    if (typeof message.content === "string")
        return message.content;
    if (Array.isArray(message.content) && message.content.every((part) => part && typeof part === "object" && part.type === "text" && typeof part.text === "string")) {
        return message.content.map((part) => part.text).join("\n");
    }
    throw new Error("stream-json supports text content only");
}
/** Read to EOF, without losing slow pipe writers; NDJSON yields before EOF. */
export async function* readPrintInput(input, format) {
    input.setEncoding("utf8");
    let buffered = "";
    let bytes = 0;
    for await (const chunk of input) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_INPUT)
            throw new Error("Print input exceeds 8 MiB");
        buffered += chunk;
        if (format === "stream-json") {
            let index;
            while ((index = buffered.indexOf("\n")) >= 0) {
                const line = buffered.slice(0, index).trim();
                buffered = buffered.slice(index + 1);
                if (line)
                    yield parseUserInput(line);
            }
        }
    }
    if (format === "text")
        yield buffered;
    else if (buffered.trim())
        yield parseUserInput(buffered.trim());
}
//# sourceMappingURL=print-input.js.map