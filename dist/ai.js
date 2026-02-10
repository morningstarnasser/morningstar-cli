import { getProvider } from "./providers.js";
export async function* streamChat(messages, config, signal) {
    const provider = getProvider(config);
    yield* provider.streamChat(messages, config, signal);
}
export async function chat(messages, config) {
    let full = "";
    for await (const token of streamChat(messages, config)) {
        if (token.type === "content")
            full += token.text;
    }
    return full;
}
//# sourceMappingURL=ai.js.map