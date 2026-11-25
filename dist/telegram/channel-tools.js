let current;
export const isTelegramTool = (name) => ["telegram_reply", "telegram_react", "telegram_edit_message"].includes(name);
export function registerTelegramTools(handler) {
    if (current)
        throw new Error("Eine Telegram-Sitzung ist bereits verbunden.");
    current = handler;
    return () => { if (current === handler)
        current = undefined; };
}
export async function executeTelegramTool(name, args, cwd) {
    try {
        return current ? await current(name, args, cwd) : { tool: name, success: false, result: "Telegram ist nicht verbunden." };
    }
    catch {
        return { tool: name, success: false, result: "Telegram-Aktion fehlgeschlagen. Verbindung, Dateipfad und Parameter prüfen." };
    }
}
export function getTelegramToolDefinitions() {
    if (!current)
        return [];
    const definition = (name, description, properties, required) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });
    return [
        definition("telegram_reply", "Send files or an extra reply ONLY to the paired Telegram chat linked to this session. Final text is sent automatically. Files must be inside the workspace, max 50 MB each. Never send credentials. Returns sent message IDs.", { text: { type: "string" }, files: { type: "array", maxItems: 10, items: { type: "string" } }, reply_to: { type: "integer", minimum: 1 } }, []),
        definition("telegram_react", "React to the current inbound Telegram message with an allowed emoji (👍 👎 ❤ 🔥 👀 🎉). Empty emoji removes the reaction.", { emoji: { type: "string", enum: ["👍", "👎", "❤", "🔥", "👀", "🎉", ""] } }, ["emoji"]),
        definition("telegram_edit_message", "Edit a message sent by this connected bot during this session. Use a message ID returned by telegram_reply.", { message_id: { type: "integer", minimum: 1 }, text: { type: "string", minLength: 1, maxLength: 4096 } }, ["message_id", "text"]),
    ];
}
//# sourceMappingURL=channel-tools.js.map