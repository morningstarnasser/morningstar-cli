/** Only known, credential-free messages are allowed to reach the terminal. */
export function telegramConnectionMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/webhook/i.test(message))
        return "Telegram nicht verbunden: Für diesen Bot ist noch ein Webhook aktiv. Die bisherige Bot-Anbindung muss zuerst bewusst getrennt werden; Morningstar entfernt sie nicht automatisch. Danach /telegram on.";
    if (/409|Conflict|bereits mit einer lokalen Sitzung/i.test(message))
        return "Telegram getrennt: Derselbe Bot wird bereits von einer anderen Sitzung verwendet. Dort /telegram off ausführen, danach hier /telegram on.";
    if (/401|Unauthorized|gültiger Telegram-Bot/i.test(message))
        return "Telegram nicht verbunden: Bot-Token ungültig. Mit /telegram:configure erneut einrichten.";
    return "Telegram-Verbindung fehlgeschlagen. Token, Internetverbindung und bestehenden Bot-Dienst prüfen; danach /telegram on erneut versuchen.";
}
//# sourceMappingURL=connection-errors.js.map