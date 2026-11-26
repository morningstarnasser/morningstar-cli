import { TelegramApiError } from "./api.js";
import { telegramConnectionMessage } from "./connection-errors.js";
/** Only allowlisted error classes/codes reach diagnostics; never raw URLs,
 * response bodies, request arguments, tokens or network exception messages. */
function reason(error) {
    if (error instanceof TelegramApiError)
        return error.status === 429 ? "Telegram-Ratenlimit (429)" : `Telegram HTTP ${error.status}`;
    let current = error;
    const codes = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
    for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
        const candidate = current;
        if (candidate.code && codes.has(candidate.code))
            return `Netzwerk (${candidate.code})`;
        current = candidate.cause;
    }
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
        return "Zeitlimit der Telegram-Abfrage";
    if (error instanceof SyntaxError)
        return "Ungültige Telegram-Serverantwort";
    return "Netzwerk- oder Serverfehler";
}
export class TelegramPollingRecovery {
    now;
    state = { status: "connected", consecutiveFailures: 0 };
    outageAt;
    lastNoticeAt;
    constructor(now = Date.now) {
        this.now = now;
    }
    failure(error) {
        const time = this.now();
        const status = error instanceof TelegramApiError ? error.status : undefined;
        const legacyFatal = !(error instanceof TelegramApiError) && error instanceof Error && /409|401|Unauthorized|Conflict/.test(error.message);
        const fatal = legacyFatal || status !== undefined && status >= 400 && status < 500 && ![408, 429].includes(status);
        const failures = this.state.consecutiveFailures + 1;
        this.outageAt ??= time;
        const retry = error instanceof TelegramApiError ? error.retryAfterSeconds : undefined;
        const delayMs = Math.max(Math.min(30000, 1000 * 2 ** Math.min(failures - 1, 5)), retry ? retry * 1000 : status === 429 ? 30000 : 0);
        this.state = { ...this.state, status: fatal ? "stopped" : "reconnecting", consecutiveFailures: failures, lastFailureAt: time, lastError: reason(error), nextRetryAt: fatal ? undefined : time + delayMs };
        if (fatal)
            return { fatal, delayMs: 0, notice: legacyFatal || status === 401 || status === 409 ? telegramConnectionMessage(error) : `Telegram-Abfrage abgewiesen (HTTP ${status}). Verbindung beendet; /telegram status prüfen.` };
        const sustained = failures >= 3 || time - this.outageAt >= 30000 || status === 429;
        if (sustained && (this.lastNoticeAt === undefined || time - this.lastNoticeAt >= 60000)) {
            this.lastNoticeAt = time;
            return { fatal: false, delayMs, notice: `Telegram verbindet erneut: ${this.state.lastError}. Automatische Wiederholung in ${Math.ceil(delayMs / 1000)} s; die Sitzung läuft weiter.` };
        }
        return { fatal: false, delayMs };
    }
    success() {
        const announced = this.lastNoticeAt !== undefined;
        this.state = { ...this.state, status: "connected", consecutiveFailures: 0, lastSuccessAt: this.now(), nextRetryAt: undefined };
        this.outageAt = this.lastNoticeAt = undefined;
        return announced ? "Telegram ist wieder erreichbar. Nachrichten werden wieder empfangen." : undefined;
    }
    stop() { this.state = { ...this.state, status: "stopped", nextRetryAt: undefined }; }
}
export async function waitForTelegramRetry(ms, signal) {
    if (signal.aborted)
        return;
    await new Promise(resolve => {
        const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
        const timer = setTimeout(finish, ms);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted)
            finish();
    });
}
//# sourceMappingURL=polling-recovery.js.map