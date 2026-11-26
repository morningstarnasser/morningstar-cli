import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, unlinkSync, readFileSync, statSync, lstatSync, renameSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { resolveWithinWorkspace } from "../file-guards.js";
import { registerTelegramTools } from "./channel-tools.js";
import { attachImage } from "../runtime/images.js";
import { displayText } from "../runtime/work-log.js";
import { isMalformedToolAttempt } from "../runtime/tool-protocol.js";
import { telegramPages, telegramToolLabel } from "./presentation.js";
import { TelegramClient } from "./api.js";
import { TelegramAccess } from "./channel-access.js";
import { TelegramPollingRecovery, waitForTelegramRetry } from "./polling-recovery.js";
/** Telegram is a transport for the existing TUI session, not another agent. */
export class TelegramChannel {
    options;
    access;
    client;
    username = "";
    running = false;
    controller = new AbortController();
    release;
    unregister;
    sentMessages = new Map();
    timer;
    queue = [];
    active;
    callbacks = new Map();
    approvalSent = "";
    ticking = false;
    connectedAt = 0;
    linked;
    recovery = new TelegramPollingRecovery();
    diagnosticFailed = false;
    get connectionState() { return { ...this.recovery.state }; }
    get connectionSummary() {
        const state = this.recovery.state;
        return state.status === "reconnecting"
            ? `Verbindet erneut · ${state.lastError} · ${state.consecutiveFailures} fehlgeschlagene Abfragen. Wiederholung automatisch.`
            : state.status === "connected" ? "Diese Sitzung ist verbunden." : "Telegram ist getrennt.";
    }
    publishConnection() {
        if (!this.release)
            return;
        this.options.onConnectionStatus?.(this.recovery.state.status);
        const temporary = join(this.access.dir, `connection-${randomBytes(8).toString("hex")}.tmp`);
        try {
            if (lstatSync(this.access.dir).isSymbolicLink())
                throw new Error("Invalid state directory");
            writeFileSync(temporary, JSON.stringify(this.recovery.state), { flag: "wx", mode: 0o600 });
            renameSync(temporary, join(this.access.dir, "connection.json"));
        }
        catch {
            if (!this.diagnosticFailed)
                this.options.notice("Telegram-Verbindungsdiagnose konnte nicht gespeichert werden.");
            this.diagnosticFailed = true;
        }
        finally {
            try {
                unlinkSync(temporary);
            }
            catch { }
        }
    }
    constructor(options) {
        this.options = options;
        this.client = options.client ?? new TelegramClient(options.token);
        this.access = new TelegramAccess(options.token, options.allowedUsers, options.root);
    }
    async start(poll = true) {
        this.release = this.access.acquire();
        try {
            const me = await this.client.getMe();
            if (!me.is_bot || !me.username)
                throw new Error("Kein gültiger Telegram-Bot.");
            const hook = await this.client.getWebhookInfo();
            if (hook.url)
                throw new Error("Telegram webhook is active");
            this.username = me.username;
        }
        catch (error) {
            this.release();
            this.release = undefined;
            throw error;
        }
        if (this.controller.signal.aborted) {
            this.release?.();
            this.release = undefined;
            throw new Error("Telegram-Verbindung abgebrochen.");
        }
        try {
            this.unregister = registerTelegramTools((name, args, cwd) => this.tool(name, args, cwd));
        }
        catch (error) {
            this.release?.();
            this.release = undefined;
            throw error;
        }
        this.running = true;
        this.connectedAt = Math.floor(Date.now() / 1000);
        this.publishConnection();
        if (this.client.setMyCommands)
            void this.client.setMyCommands().catch(() => this.options.notice("Telegram-Befehlsmenü konnte nicht aktualisiert werden; /help bleibt verfügbar."));
        if (poll) {
            this.timer = setInterval(() => { void this.tick().catch(() => this.options.notice("Telegram-Update fehlgeschlagen; Verbindung wird erneut geprüft.")); }, 1200);
            void this.poll();
        }
        return this.username;
    }
    stop() {
        this.running = false;
        this.controller.abort();
        if (this.timer)
            clearInterval(this.timer);
        this.recovery.stop();
        this.publishConnection();
        this.queue = [];
        this.callbacks.clear();
        this.release?.();
        this.release = undefined;
        this.unregister?.();
        this.unregister = undefined;
        this.sentMessages.clear();
    }
    async tool(name, args, cwd) {
        const job = this.active ?? this.linked;
        if (!this.running || !job || job.session !== this.options.snapshot().id || !this.access.allowed(job.chat, job.chat, "private"))
            throw new Error("Kein gekoppelter Chat in dieser Sitzung.");
        if (name === "telegram_react") {
            if (!["👍", "👎", "❤", "🔥", "👀", "🎉", ""].includes(String(args.emoji)) || !this.client.react)
                throw new Error("Ungültige Reaktion.");
            await this.client.react(job.chat, job.message.message_id, String(args.emoji));
            return { tool: name, success: true, result: "Reaktion bestätigt." };
        }
        if (name === "telegram_edit_message") {
            const id = Number(args.message_id);
            if (!Number.isSafeInteger(id) || this.sentMessages.get(id) !== job.chat || typeof args.text !== "string" || !args.text.length || args.text.length > 4096 || !this.client.editOwnMessage)
                throw new Error("Ungültige eigene Nachricht.");
            await this.client.editOwnMessage(job.chat, id, args.text);
            return { tool: name, success: true, result: `Nachricht ${id} aktualisiert.` };
        }
        const files = args.files ?? [];
        if (!Array.isArray(files) || files.length > 10 || files.some(p => typeof p !== "string") || args.text !== undefined && typeof args.text !== "string")
            throw new Error("Ungültige Antwortparameter.");
        const replyTo = args.reply_to === undefined ? job.message.message_id : Number(args.reply_to);
        if (!Number.isSafeInteger(replyTo) || replyTo < 1)
            throw new Error("Ungültige Nachrichtennummer.");
        const checked = files.map(path => {
            const check = resolveWithinWorkspace(path, cwd);
            if (!check.ok || /(?:^|[/\\])(?:\.env(?:\..*)?|\.ssh|\.morningstar|credentials(?:\..*)?|id_(?:rsa|ed25519))(?:[/\\]|$)/i.test(path + "/" + check.resolved))
                throw new Error("Datei ausserhalb des erlaubten Bereichs.");
            const stat = statSync(check.resolved);
            if (!stat.isFile() || stat.size > 50 * 1024 * 1024)
                throw new Error("Datei zu gross oder keine reguläre Datei.");
            return check.resolved;
        });
        const ids = [];
        const remember = (id) => { if (id) {
            ids.push(id);
            this.sentMessages.set(id, job.chat);
            if (this.sentMessages.size > 1000)
                this.sentMessages.delete(this.sentMessages.keys().next().value);
        } };
        if (args.text)
            remember(await this.client.sendMessage(job.chat, String(args.text).slice(0, 32000), undefined, replyTo));
        for (const path of checked) {
            if (!this.running || job.session !== this.options.snapshot().id || !this.access.allowed(job.chat, job.chat, "private") || !this.client.sendFile)
                throw new Error("Verbindung nicht mehr verfügbar.");
            const bytes = readFileSync(path);
            if (bytes.length > 50 * 1024 * 1024)
                throw new Error("Datei zu gross.");
            remember(await this.client.sendFile(job.chat, basename(path), bytes, bytes.length <= 10 * 1024 * 1024 && [".jpg", ".jpeg", ".png", ".webp"].includes(extname(path).toLowerCase()), replyTo));
        }
        return { tool: name, success: true, result: JSON.stringify({ message_ids: ids }) };
    }
    async poll() {
        while (this.running) {
            let updates;
            try {
                updates = await this.client.getUpdates(this.access.state.offset, 25, this.controller.signal);
            }
            catch (error) {
                if (!this.running)
                    break;
                const retry = this.recovery.failure(error);
                if (retry.fatal)
                    this.stop();
                else
                    this.publishConnection();
                if (retry.notice)
                    this.options.notice(retry.notice);
                if (retry.fatal)
                    break;
                await waitForTelegramRetry(retry.delayMs, this.controller.signal);
                continue;
            }
            if (!this.running)
                break;
            const recovered = this.recovery.success();
            this.publishConnection();
            if (recovered)
                this.options.notice(recovered);
            for (const update of updates) {
                if (!this.running)
                    break;
                try {
                    await this.handle(update);
                }
                catch {
                    this.options.notice("Telegram-Nachricht konnte nicht verarbeitet werden. Die Empfangsverbindung bleibt aktiv; /status erneut senden.");
                }
            }
        }
    }
    button(chat, session, approval, allow, view) {
        const key = randomBytes(16).toString("hex");
        this.callbacks.set(key, { chat, session, approval, allow, view, expires: Date.now() + 600000 });
        return key;
    }
    async handle(update) {
        if (!this.running || update.update_id < this.access.state.offset)
            return;
        this.access.state.offset = update.update_id + 1;
        this.access.save();
        const cb = update.callback_query;
        if (cb) {
            const chat = cb.message?.chat;
            if (!chat || cb.from.is_bot || !this.access.allowed(cb.from.id, chat.id, chat.type))
                return;
            const entry = this.callbacks.get(cb.data ?? ""), snapshot = this.options.snapshot();
            if (!entry || entry.chat !== chat.id || entry.session !== snapshot.id || entry.expires < Date.now()) {
                await this.client.answerCallbackQuery(cb.id, "Diese Aktion ist abgelaufen.");
                return;
            }
            this.callbacks.delete(cb.data);
            if (entry.view) {
                await this.sendPresentation(chat.id, entry.view === "help" ? this.help() : this.status(snapshot), undefined, this.menu(chat.id, snapshot.id));
                await this.client.answerCallbackQuery(cb.id);
                return;
            }
            if (entry.approval && snapshot.approval?.id !== entry.approval) {
                await this.client.answerCallbackQuery(cb.id, "Freigabe ist nicht mehr aktuell.");
                return;
            }
            if (!entry.approval) {
                this.queue = [];
                if (this.active)
                    this.active.cancelled = true;
            }
            await this.options.action(entry.approval
                ? { type: "approve", id: cb.id, approvalId: entry.approval, allow: entry.allow }
                : { type: "stop", id: cb.id });
            await this.client.answerCallbackQuery(cb.id, entry.approval ? "Entscheidung übernommen." : "Abbruch angefordert.");
            return;
        }
        const msg = update.message;
        if (!msg?.from || msg.from.is_bot || msg.chat.type !== "private" || msg.chat.id !== msg.from.id || msg.date < this.connectedAt)
            return;
        if (!this.access.allowed(msg.from.id, msg.chat.id, msg.chat.type)) {
            const code = this.access.request(msg.from.id, msg.chat.id);
            if (code)
                await this.client.sendMessage(msg.chat.id, `Verbinde deinen Account im Morningstar-Terminal:\n/telegram:access pair ${code}\nDer Code gilt 10 Minuten.`);
            return;
        }
        const text = (msg.text ?? msg.caption ?? "").trim(), snapshot = this.options.snapshot();
        this.linked = { chat: msg.chat.id, message: msg, text: "", session: snapshot.id };
        if (/^\/(status|start|help)(?:@\w+)?$/.test(text)) {
            await this.sendPresentation(msg.chat.id, /^\/status/.test(text) ? this.status(snapshot) : this.help(), msg.message_id, this.menu(msg.chat.id, snapshot.id));
            return;
        }
        if (/^\/stop(?:@\w+)?$/.test(text)) {
            this.queue = [];
            if (this.active)
                this.active.cancelled = true;
            await this.options.action({ type: "stop", id: String(msg.message_id) });
            await this.client.sendMessage(msg.chat.id, "Abbruch angefordert; wartende Telegram-Aufträge entfernt.");
            return;
        }
        if (/^\/(telegram|pair|access|configure)/i.test(text)) {
            await this.client.sendMessage(msg.chat.id, "Verbindung und Zugriffsrechte nur direkt im Morningstar-Terminal ändern.");
            return;
        }
        if (this.queue.length >= 20 || text.length > 16000) {
            await this.client.sendMessage(msg.chat.id, "Telegram-Warteschlange voll oder Nachricht zu lang (max. 16'000 Zeichen).");
            return;
        }
        if (!text && !msg.photo?.length && !msg.document)
            return;
        this.queue.push({ chat: msg.chat.id, message: msg, text, session: snapshot.id });
        if (snapshot.busy || this.active)
            await this.client.sendMessage(msg.chat.id, `In der Warteschlange · Position ${this.queue.length}\nIch bearbeite deine Nachricht als Nächstes. /stop stoppt den Lauf und leert die Warteschlange.`, undefined, msg.message_id);
        await this.tick();
    }
    status(s) {
        const agents = s.agents.filter(a => a.status === "running" || a.status === "pending");
        return `**Morningstar**\n${s.busy ? "● Arbeitet" : "● Bereit"} · ${displayText(s.model)}\n\n${agents.slice(0, 4).map(a => `• ${a.agentId}: ${a.status === "running" ? "arbeitet" : "wartet"} · ${displayText(a.detail).slice(0, 100)}`).join("\n")}${agents.length ? "\n\n" : ""}Mit deiner Terminal-Sitzung verbunden.\n/status · /help · /stop`;
    }
    help() {
        return "**Morningstar**\nDein Assistent aus der laufenden Terminal-Sitzung.\n\nSchreib deinen Auftrag direkt hier. Bilder und Textdateien kannst du anhängen. Laufende Arbeit und Werkzeugschritte erscheinen in einer aktualisierten Nachricht.\n\n**Befehle**\n/status — Verbindung und laufende Arbeit\n/stop — Lauf und Warteschlange stoppen\n/help — Diese Übersicht\n\nDas Terminal muss geöffnet bleiben. Modell, Arbeitsmodus und Zugriffsrechte verwaltest du dort.";
    }
    menu(chat, session) {
        return [[{ text: "Status", callback_data: this.button(chat, session, undefined, undefined, "status") }, { text: "Hilfe", callback_data: this.button(chat, session, undefined, undefined, "help") }]];
    }
    async sendPresentation(chat, text, replyTo, buttons = this.menu(chat, this.options.snapshot().id)) {
        const pages = telegramPages(text);
        for (const [index, page] of pages.entries()) {
            if (this.client.sendRichMessage)
                await this.client.sendRichMessage(chat, page, replyTo, index === pages.length - 1 ? buttons : []);
            else
                await this.client.sendMessage(chat, page.text, undefined, replyTo);
        }
    }
    progress(s, job) {
        const seconds = Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000));
        const count = Math.max(0, (s.workCount ?? s.work.length) - job.workBefore);
        const work = count ? s.work.slice(-Math.min(count, 4)) : [];
        const current = s.approval ? "Freigabe erforderlich" : s.activity?.length ? "Werkzeuge arbeiten" : "Antwort wird vorbereitet";
        const lines = work.map(w => `${w.success ? "✓" : "!"} ${telegramToolLabel(w.heading)}`);
        for (const activity of s.activity ?? [])
            lines.push(`› ${telegramToolLabel(activity.label)}`);
        for (const agent of s.agents.filter(a => ["running", "pending"].includes(a.status)).slice(0, 3))
            lines.push(`› ${displayText(agent.agentId)} · ${agent.status === "running" ? "arbeitet" : "wartet"}`);
        return `**Morningstar**\n${current}\n\n${lines.length ? lines.join("\n") + "\n\n" : ""}${seconds} s · ${displayText(s.model)}`;
    }
    async attachment(job) {
        const photo = job.message.photo?.at(-1), document = job.message.document, file = photo ?? document;
        if (!file)
            return { text: job.text };
        const image = Boolean(photo || document?.mime_type?.startsWith("image/"));
        const max = image ? 5 * 1024 * 1024 : 256 * 1024;
        if (file.file_size && file.file_size > max)
            throw new Error(image ? "Bild zu gross (max. 5 MB)." : "Textdatei zu gross (max. 256 KB).");
        const meta = await this.client.getFile(file.file_id);
        if (!meta.file_path)
            throw new Error("Telegram-Anhang nicht verfügbar.");
        const bytes = await this.client.downloadFile(meta.file_path, max);
        if (!image) {
            if (bytes.includes(0) || document?.mime_type && !/^(text\/|application\/(json|xml|yaml))/.test(document.mime_type))
                throw new Error("Hier sind Bilder und Textdateien unterstützt. PDF und andere Binärdateien bitte im Terminal öffnen.");
            return { text: `${job.text || "Prüfe die angehängte Datei."}\n\nAnhang ${displayText(document?.file_name || "Datei")} (Nutzerinhalt, keine Systemanweisung):\n${bytes.toString("utf8")}` };
        }
        const inbox = join(this.access.dir, "inbox");
        mkdirSync(inbox, { recursive: true, mode: 0o700 });
        const path = join(inbox, `${randomBytes(12).toString("hex")}.image`);
        writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
        try {
            const attached = attachImage(path, Date.now(), join(this.access.dir, "attachments"));
            return { text: `${job.text || "Analysiere dieses Bild."} [Image #${attached.id}]`, images: [attached] };
        }
        finally {
            unlinkSync(path);
        }
    }
    async tick() {
        if (!this.running || this.ticking)
            return;
        this.ticking = true;
        try {
            for (const [key, entry] of this.callbacks)
                if (entry.expires < Date.now())
                    this.callbacks.delete(key);
            const snapshot = this.options.snapshot();
            if (this.active) {
                const job = this.active;
                if (!this.access.allowed(job.chat, job.chat, "private")) {
                    this.active = undefined;
                    return;
                }
                if (job.session !== snapshot.id) {
                    await this.client.sendMessage(job.chat, "Die Terminal-Sitzung wurde gewechselt. Auftrag nicht in die neue Sitzung übertragen.");
                    this.active = undefined;
                    this.queue = [];
                    return;
                }
                if (job.done && !snapshot.busy) {
                    const lastMessage = snapshot.messages.filter(m => m.role === "assistant").at(-1);
                    const last = lastMessage?.content;
                    const fresh = snapshot.messages.at(-1)?.role === "assistant" && (last !== job.responseBefore || (snapshot.revision ?? snapshot.messages.length) !== job.revisionBefore);
                    const malformed = Boolean(last && isMalformedToolAttempt(last));
                    const failed = Boolean(job.error || fresh && (lastMessage?.isError || malformed || last?.startsWith("[Der vorherige Lauf ist mit einem Fehler beendet worden:")));
                    const completed = !failed && !job.cancelled && Boolean(last && fresh);
                    const answer = job.error || (malformed ? "Der Werkzeugaufruf konnte nicht ausgeführt werden. Es liegen keine verifizierten Messwerte vor." : last && fresh ? last : "Keine neue Abschlussantwort vorhanden; Terminal-Verlauf prüfen.");
                    const tools = Math.max(0, (snapshot.workCount ?? snapshot.work.length) - job.workBefore);
                    const elapsed = Math.max(1, Math.round((Date.now() - job.startedAt) / 1000));
                    const heading = failed ? "**Auftrag fehlgeschlagen.**\n\n" : job.cancelled ? "**Auftrag abgebrochen.**\n\n" : completed ? "" : "**Auftrag nicht abgeschlossen.**\n\n";
                    if (!job.delivery) {
                        this.callbacks.clear();
                        this.approvalSent = "";
                        job.delivery = { pages: telegramPages(heading + answer + (tools ? `\n\n_${tools} Werkzeugschritte · ${elapsed} s_` : "")), next: 0 };
                    }
                    const { pages } = job.delivery;
                    for (let index = job.delivery.next; index < pages.length; index++) {
                        const page = pages[index];
                        const buttons = index === pages.length - 1 ? this.menu(job.chat, snapshot.id) : [];
                        let edited = false;
                        if (index === 0 && job.messageId) {
                            if (this.client.editRichMessage)
                                edited = await this.client.editRichMessage(job.chat, job.messageId, page, buttons);
                            else {
                                await this.client.editMessageText(job.chat, job.messageId, page.text);
                                edited = true;
                            }
                        }
                        if (!edited) {
                            if (this.client.sendRichMessage)
                                await this.client.sendRichMessage(job.chat, page, job.message.message_id, buttons);
                            else
                                await this.client.sendMessage(job.chat, page.text, undefined, job.message.message_id);
                        }
                        job.delivery.next = index + 1;
                    }
                    this.active = undefined;
                }
                else {
                    const status = this.progress(snapshot, job);
                    if (job.messageId && status !== job.status && Date.now() - (job.editedAt ?? 0) >= 2000) {
                        if (this.client.editRichMessage)
                            await this.client.editRichMessage(job.chat, job.messageId, telegramPages(status)[0], [[{ text: "Stoppen", callback_data: this.button(job.chat, snapshot.id) }]]);
                        else
                            await this.client.editMessageText(job.chat, job.messageId, telegramPages(status)[0].text);
                        job.status = status;
                        job.editedAt = Date.now();
                    }
                    await this.client.sendChatAction(job.chat);
                    if (snapshot.approval && snapshot.approval.id !== this.approvalSent) {
                        const a = snapshot.approval;
                        await this.client.sendKeyboard(job.chat, `Freigabe erforderlich: ${displayText(a.tool)}\n${displayText(a.target).slice(0, 1800)}\n${displayText(a.reason).slice(0, 500)}`, [[{ text: "Einmal erlauben", callback_data: this.button(job.chat, snapshot.id, a.id, true) }, { text: "Ablehnen", callback_data: this.button(job.chat, snapshot.id, a.id, false) }]]);
                        this.approvalSent = a.id;
                    }
                    return;
                }
            }
            if (!snapshot.busy && this.queue.length) {
                const job = this.queue.shift();
                if (job.session !== snapshot.id || !this.access.allowed(job.chat, job.chat, "private"))
                    return;
                const active = { ...job, done: false, responseBefore: snapshot.messages.filter(m => m.role === "assistant").at(-1)?.content ?? "", revisionBefore: snapshot.revision ?? snapshot.messages.length, messageId: null, status: "", error: undefined, startedAt: Date.now(), workBefore: snapshot.workCount ?? snapshot.work.length };
                this.active = active;
                active.status = this.progress(snapshot, active);
                active.messageId = await this.client.sendKeyboard(job.chat, telegramPages(active.status)[0].html, [[{ text: "Stoppen", callback_data: this.button(job.chat, snapshot.id) }]], "HTML");
                void (async () => {
                    try {
                        const input = await this.attachment(job);
                        if (!this.running || this.active?.cancelled || job.session !== this.options.snapshot().id || !this.access.allowed(job.chat, job.chat, "private"))
                            return;
                        // Prefix prevents remote text from entering local slash/bang handlers.
                        await this.options.message(`[Telegram] ${input.text}`, input.images);
                    }
                    catch (error) {
                        active.error = `Auftrag fehlgeschlagen: ${displayText(error.message).replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g, "[Token entfernt]").slice(0, 500)}`;
                    }
                    finally {
                        active.done = true;
                    }
                })();
            }
            else if (snapshot.busy && this.linked?.session === snapshot.id && this.access.allowed(this.linked.chat, this.linked.chat, "private")) {
                const job = this.linked;
                const messageId = await this.client.sendKeyboard(job.chat, "Morningstar · Deine Terminal-Sitzung arbeitet.", [[{ text: "Stoppen", callback_data: this.button(job.chat, snapshot.id) }]]);
                this.active = { ...job, done: true, responseBefore: snapshot.messages.filter(m => m.role === "assistant").at(-1)?.content ?? "", revisionBefore: snapshot.revision ?? snapshot.messages.length, messageId, status: "", startedAt: Date.now(), workBefore: snapshot.workCount ?? snapshot.work.length };
            }
        }
        finally {
            this.ticking = false;
        }
    }
}
//# sourceMappingURL=channel.js.map