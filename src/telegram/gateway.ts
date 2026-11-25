// ─── Telegram Gateway Daemon (Hermes-style remote agent "Carry") ─────────────
// Runs the full Morningstar coding agent over a Telegram bot. Long-polls for
// messages from allow-listed users, runs each through the shared headless agent
// engine (with all tools), and replies. Also ticks the cron scheduler and the
// nightly learning distillation.

import { homedir } from "node:os";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  runAgent,
  type StreamFn,
  type TextToolExecFn,
  type ToolApprovalRequest,
  type ToolApprovalResponse,
} from "../agent-runner.js";
import { streamChat as realStreamChat } from "../ai.js";
import { createResilientStream, pickModelChain } from "../model-fallback.js";
import { detectProject, buildSystemPrompt } from "../context.js";
import { loadSavedConfig, createApiKeyHelpers } from "../cli-bootstrap.js";
import { detectProvider, getProviderBaseUrl, getProviderApiKeyEnv } from "../providers.js";
import type { CLIConfig, Message } from "../types.js";
import { TelegramClient, type TelegramUpdate, type TelegramCallbackQuery } from "./api.js";
import { buildModelKeyboard, modelFromCallback, modelMenuText } from "./models-menu.js";
import { resolveTranscriber, type TranscribeFn } from "./transcribe.js";
import { loadTelegramConfig, isUserAllowed, type TelegramConfig } from "./config.js";
import { SessionStore, type ChatSession } from "./sessions.js";
import { dueJobs, loadJobs, recordRun, cronMatches } from "../scheduler.js";
import { Brain } from "../brain/store.js";
import { buildDistillPrompt, parseDistillation, formatDistillReport, DISTILL_SYSTEM_PROMPT } from "../brain/distill.js";
import { parseTasks, runParallel, formatParallelResults } from "../parallel-agents.js";
import { loadPersona, seedPersonaDefaults, AGENT_NAME } from "../persona.js";
import { formatHud } from "../tui-format.js";
import { escapeApprovalDisplay } from "../approval-display.js";

const FALLBACK_MODEL = "nvidia/moonshotai/kimi-k2-instruct";
const CRON_TICK_MS = 20000;
const DEFAULT_APPROVAL_TIMEOUT_MS = 120_000;
const MAX_TELEGRAM_APPROVAL_TARGET = 64 * 1024;
const INLINE_APPROVAL_TARGET = 1_200;
const ABORTED_TURN_MARKER =
  "[Vom Nutzer abgebrochen. Diesen Auftrag nicht fortsetzen oder als ausstehend behandeln.]";

interface RunState {
  controller: AbortController;
}

interface PendingApproval {
  chatId: number;
  request: ToolApprovalRequest;
  resolve: (response: ToolApprovalResponse) => void;
}

/** Test seam: inject a fake Telegram client and/or model stream. */
export interface GatewayDeps {
  client?: TelegramClient;
  streamFn?: StreamFn;
  textToolExecFn?: TextToolExecFn;
  brain?: Brain;
  transcribe?: TranscribeFn;
  approvalTimeoutMs?: number;
  /** Inject storage explicitly; fake-client test seams default to memory-only. */
  sessionStore?: SessionStore;
  /** Isolate identity fixtures without reading the operator's private profile. */
  personaDir?: string;
}

export class TelegramGateway {
  private client: TelegramClient;
  private store: SessionStore;
  private offset = 0;
  private running = false;
  private active = new Map<number, RunState>();
  private getStoredApiKey: (provider: string) => string;
  private cronTimer?: NodeJS.Timeout;
  private cronRunning = new Set<string>();
  private streamFn?: StreamFn;
  private textToolExecFn?: TextToolExecFn;
  private brain: Brain;
  private pendingApprovals = new Map<string, PendingApproval>();
  private approvalSeq = 0;
  private approvalTimeoutMs: number;
  private lastDistillDay = "";
  private transcribe?: TranscribeFn;
  private personaDir?: string;

  constructor(private config: TelegramConfig, deps: GatewayDeps = {}) {
    this.personaDir = deps.personaDir;
    this.client = deps.client ?? new TelegramClient(config.token);
    this.streamFn = deps.streamFn;
    this.textToolExecFn = deps.textToolExecFn;
    this.store = deps.sessionStore
      ?? new SessionStore(
        config.defaultCwd!,
        config.historyLimit,
        Date.now,
        deps.client ? null : undefined,
      );
    this.brain = deps.brain ?? new Brain();
    this.transcribe = deps.transcribe ?? resolveTranscriber() ?? undefined;
    this.approvalTimeoutMs = Math.max(1, deps.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS);
    const saved = loadSavedConfig();
    this.getStoredApiKey = createApiKeyHelpers(saved).getStoredApiKey;
  }

  /** Drive a single update to completion. Public seam for integration tests. */
  async processUpdate(update: TelegramUpdate): Promise<void> {
    await this.handleUpdate(update);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const seeded = seedPersonaDefaults();
    if (seeded.length) this.log(`Persona seeded: ${seeded.join(", ")}`);
    const me = await this.client.getMe();
    this.log(`${AGENT_NAME} online as @${me.username} (id ${me.id})`);
    this.log(`Allow-list: ${this.config.allowedUsers.join(", ") || "(empty — all users denied)"}`);
    this.log(`Agent model: ${this.config.model || "(saved default)"} · cwd: ${this.config.defaultCwd}`);

    this.running = true;
    this.cronTimer = setInterval(() => void this.tickCron(), CRON_TICK_MS);
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());

    while (this.running) {
      try {
        const updates = await this.client.getUpdates(this.offset, 50);
        for (const update of updates) {
          this.offset = update.update_id + 1;
          void this.handleUpdate(update);
        }
      } catch (e) {
        this.log(`poll error: ${(e as Error).message}`);
        await sleep(3000);
      }
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.cronTimer) clearInterval(this.cronTimer);
    for (const { controller } of this.active.values()) controller.abort();
    for (const pending of [...this.pendingApprovals.values()]) {
      pending.resolve({ approved: false, reason: "gateway stopped before approval" });
    }
    this.log("Gateway stopped.");
    process.exit(0);
  }

  // ─── Update handling ───────────────────────────────────────────────────────

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) return this.handleCallback(update.callback_query);
    const msg = update.message;
    if (!msg) return;
    const userId = msg.from?.id;
    const chatId = msg.chat.id;

    if (!isUserAllowed(userId, this.config.allowedUsers)) {
      this.log(`DENIED user ${userId} (${msg.from?.username ?? "?"})`);
      await this.client.sendMessage(chatId, "⛔ Nicht autorisiert. Dieser Bot ist privat.");
      return;
    }

    const voice = msg.voice ?? msg.audio;
    if (voice) return this.handleVoice(chatId, voice);
    if (!msg.text) return;

    const text = msg.text.trim();
    if (text.startsWith("/")) return this.handleCommand(chatId, text);
    return this.handlePrompt(chatId, text);
  }

  /** Transcribe a voice/audio message and run it as a normal prompt. */
  private async handleVoice(chatId: number, voice: { file_id: string; mime_type?: string }): Promise<void> {
    if (!this.transcribe) {
      return void this.client.sendMessage(chatId, "🎙️ Sprachnachricht empfangen, aber kein Transcriber konfiguriert. Setze MORNINGSTAR_STT_CMD.");
    }
    try {
      await this.client.sendChatAction(chatId, "typing");
      const file = await this.client.getFile(voice.file_id);
      if (!file.file_path) throw new Error("kein file_path");
      const audio = await this.client.downloadFile(file.file_path);
      const text = (await this.transcribe(audio, voice.mime_type ?? "audio/ogg")).trim();
      if (!text) return void this.client.sendMessage(chatId, "🎙️ Konnte nichts verstehen.");
      await this.client.sendMessage(chatId, `🎙️ _"${text}"_`, "Markdown");
      if (text.startsWith("/")) return this.handleCommand(chatId, text);
      return this.handlePrompt(chatId, text);
    } catch (e) {
      return void this.client.sendMessage(chatId, `🎙️ Transkription fehlgeschlagen: ${(e as Error).message}`);
    }
  }

  private async handleCommand(chatId: number, text: string): Promise<void> {
    const [cmd, ...rest] = text.slice(1).split(/\s+/);
    const arg = rest.join(" ").trim();
    // Raw argument preserving newlines (needed for /parallel multi-line tasks).
    const rawArg = text.slice(1 + cmd.length).replace(/^\s+/, "");
    const normalizedCommand = cmd.toLowerCase();
    if (
      this.active.has(chatId)
      && ["new", "reset", "model", "cwd", "parallel", "team", "distill"].includes(normalizedCommand)
    ) {
      return void this.client.sendMessage(chatId, "⏳ Erst den laufenden Auftrag mit /stop beenden.");
    }
    const session = this.store.get(chatId);

    switch (normalizedCommand) {
      case "start":
      case "help":
        return void this.client.sendMessage(chatId, HELP_TEXT);
      case "new":
      case "reset":
        this.store.reset(chatId);
        return void this.client.sendMessage(chatId, "🧹 Kontext zurückgesetzt.");
      case "status":
        return void this.client.sendMessage(chatId, this.statusText(session));
      case "model":
        return this.showOrSetModel(chatId, arg, session.model);
      case "cwd":
        return this.setCwd(chatId, arg);
      case "stop": {
        const state = this.active.get(chatId);
        if (state) { state.controller.abort(); return void this.client.sendMessage(chatId, "🛑 Lauf abgebrochen."); }
        return void this.client.sendMessage(chatId, "Nichts läuft gerade.");
      }
      case "cron":
        return this.handleCron(chatId, arg);
      case "parallel":
      case "team":
        return this.handleParallel(chatId, rawArg);
      case "distill":
        return this.runDistillation(chatId);
      case "whoami":
      case "soul": {
        const persona = loadPersona(this.personaDir);
        return void this.client.sendMessage(chatId, persona ? persona.slice(0, 3500) : `Ich bin ${AGENT_NAME}. (Noch keine Persona-Dateien in ~/.morningstar/.)`);
      }
      case "remember":
        if (!arg) return void this.client.sendMessage(chatId, "Nutzung: /remember <text>");
        this.brain.remember(arg, "note");
        return void this.client.sendMessage(chatId, "🧠 Gemerkt.");
      case "recall": {
        if (!arg) return void this.client.sendMessage(chatId, "Nutzung: /recall <suchbegriff>");
        const hits = this.brain.recallText(arg, 8);
        return void this.client.sendMessage(chatId, hits || "Nichts Relevantes gefunden.");
      }
      default:
        return void this.client.sendMessage(chatId, `Unbekannter Befehl: /${cmd}\n\n${HELP_TEXT}`);
    }
  }

  /** /model with no arg → show the picker keyboard; with an arg → set directly. */
  private async showOrSetModel(chatId: number, arg: string, currentModel?: string): Promise<void> {
    if (!arg) {
      const current = currentModel || this.config.model;
      const hasKeyFn = (p: string) => Boolean(this.getStoredApiKey(p));
      const keyboard = buildModelKeyboard(hasKeyFn, current);
      await this.client.sendKeyboard(chatId, modelMenuText(current, hasKeyFn), keyboard, "Markdown");
      return;
    }
    return this.setModel(chatId, arg);
  }

  private async setModel(chatId: number, model: string): Promise<void> {
    const provider = detectProvider(model);
    const hasKey = Boolean(this.getStoredApiKey(provider));
    this.store.update(chatId, { model });
    const warn = hasKey ? "" : `\n⚠️ Kein API-Key für ${provider} (${getProviderApiKeyEnv(provider)}).`;
    return void this.client.sendMessage(chatId, `✅ Modell: ${model} (${provider})${warn}`);
  }

  private async setCwd(chatId: number, path: string): Promise<void> {
    if (!path) return void this.client.sendMessage(chatId, "Nutzung: /cwd <pfad>");
    const expanded = path.startsWith("~") ? path.replace(/^~/, homedir()) : path;
    const abs = resolve(expanded);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      return void this.client.sendMessage(chatId, `❌ Kein Verzeichnis: ${abs}`);
    }
    this.store.update(chatId, { cwd: abs });
    return void this.client.sendMessage(chatId, `📁 Arbeitsverzeichnis: ${abs}`);
  }

  // ─── Callbacks (model picker + approvals) ──────────────────────────────────

  private async handleCallback(cb: TelegramCallbackQuery): Promise<void> {
    const userId = cb.from?.id;
    const chatId = cb.message?.chat.id;
    if (!isUserAllowed(userId, this.config.allowedUsers)) {
      await this.client.answerCallbackQuery(cb.id, "⛔ Nicht autorisiert");
      return;
    }
    if (chatId === undefined) return;
    const data = cb.data || "";

    if (data.startsWith("ok:") || data.startsWith("no:")) {
      return this.handleApprovalCallback(cb.id, chatId, data);
    }

    if (data === "m:close") {
      await this.client.answerCallbackQuery(cb.id, "Geschlossen");
      if (cb.message) await this.client.editMessageText(chatId, cb.message.message_id, "🤖 Modell-Auswahl geschlossen.");
      return;
    }

    const model = modelFromCallback(data);
    if (!model) {
      await this.client.answerCallbackQuery(cb.id);
      return;
    }
    if (this.active.has(chatId)) {
      await this.client.answerCallbackQuery(cb.id, "Erst den laufenden Auftrag beenden.");
      return;
    }
    const provider = detectProvider(model);
    const hasKey = Boolean(this.getStoredApiKey(provider));
    this.store.update(chatId, { model });
    await this.client.answerCallbackQuery(cb.id, `Modell: ${model}`);
    const warn = hasKey ? "" : `\n⚠️ Kein API-Key für ${provider} (${getProviderApiKeyEnv(provider)}).`;
    await this.client.sendMessage(chatId, `✅ Modell gewechselt: ${model} (${provider})${warn}`);
  }

  private async handleApprovalCallback(callbackId: string, chatId: number, data: string): Promise<void> {
    const token = data.slice(3);
    const pending = this.pendingApprovals.get(token);
    if (!pending || pending.chatId !== chatId) {
      return void this.client.answerCallbackQuery(callbackId, "Abgelaufen.");
    }
    if (data.startsWith("no:")) {
      pending.resolve({ approved: false, reason: "denied by Telegram user" });
      await this.client.answerCallbackQuery(callbackId, "Abgelehnt");
      return void this.client.sendMessage(chatId, "❌ Aktion abgelehnt — nicht ausgeführt.");
    }

    pending.resolve({ approved: true, reason: "allowed once by Telegram user" });
    await this.client.answerCallbackQuery(callbackId, "Einmal freigegeben");
    await this.client.sendMessage(chatId, "✅ Einmal freigegeben — der aktuelle Lauf wird fortgesetzt.");
  }

  // ─── Agent execution ───────────────────────────────────────────────────────

  private async handlePrompt(chatId: number, prompt: string): Promise<void> {
    if (this.active.has(chatId)) {
      return void this.client.sendMessage(chatId, "⏳ Ich arbeite noch an deiner letzten Anfrage. /stop zum Abbrechen.");
    }
    this.store.append(chatId, { role: "user", content: prompt });
    await this.runAndReply(chatId, prompt);
  }

  /** Run the agent for the chat's current session and reply. */
  private async runAndReply(chatId: number, prompt: string): Promise<void> {
    const controller = new AbortController();
    this.active.set(chatId, { controller });
    await this.client.sendChatAction(chatId, "typing");
    const heartbeat = setInterval(() => void this.client.sendChatAction(chatId, "typing"), 4000);

    try {
      const session = this.store.get(chatId);
      const result = await this.runForChat(session, controller.signal);
      const hud = formatHud({ model: session.model || this.config.model || FALLBACK_MODEL, cwd: session.cwd, turn: result.turns });
      const tools = result.toolCalls.length ? `  ·  🔧 ${result.toolCalls.length}${result.hitTurnLimit ? " · Turn-Limit" : ""}` : "";
      const footer = `\n\n— ${hud}${tools}`;
      const reply = (result.finalText || "(keine Antwort)") + footer;
      if (result.aborted) {
        this.store.append(chatId, { role: "assistant", content: ABORTED_TURN_MARKER });
      } else if (result.finalText) {
        this.store.append(chatId, { role: "assistant", content: result.finalText });
      }
      if (!result.aborted && result.finalText) {
        this.brain.remember(`Aufgabe: ${prompt}\n→ ${result.finalText.slice(0, 280)}`, "outcome");
      }
      await this.client.sendMessage(chatId, result.aborted ? "🛑 Abgebrochen." : reply);
    } catch (e) {
      await this.client.sendMessage(chatId, `❌ Fehler: ${(e as Error).message}`);
    } finally {
      this.cancelApprovalsForChat(chatId, "agent run ended before approval");
      clearInterval(heartbeat);
      this.active.delete(chatId);
    }
  }

  /** Resolve an agent `ask` verdict through a Telegram inline keyboard. */
  private requestApproval(
    chatId: number,
    request: ToolApprovalRequest,
    signal?: AbortSignal,
  ): Promise<ToolApprovalResponse> {
    return new Promise((resolveApproval) => {
      if (signal?.aborted) {
        resolveApproval({ approved: false, reason: "agent run was already aborted" });
        return;
      }

      const target = approvalTarget(request) || "(kein Ziel angegeben)";
      if (target.length > MAX_TELEGRAM_APPROVAL_TARGET) {
        void this.client.sendMessage(
          chatId,
          formatOversizedApprovalRejection(request, target),
        );
        resolveApproval({
          approved: false,
          reason: `approval arguments exceed ${MAX_TELEGRAM_APPROVAL_TARGET} characters`,
        });
        return;
      }

      const token = `a${++this.approvalSeq}`;
      let settled = false;
      let timeout: NodeJS.Timeout;

      const onAbort = () => settle({ approved: false, reason: "agent run aborted while awaiting approval" });
      const settle = (response: ToolApprovalResponse): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        this.pendingApprovals.delete(token);
        resolveApproval(response);
      };

      timeout = setTimeout(() => {
        settle({ approved: false, reason: "Telegram approval timed out" });
        void this.client.sendMessage(chatId, "⌛ Freigabe abgelaufen — Aktion wurde abgelehnt.");
      }, this.approvalTimeoutMs);
      timeout.unref?.();

      this.pendingApprovals.set(token, { chatId, request, resolve: settle });
      signal?.addEventListener("abort", onAbort, { once: true });

      const sendApproval = async (): Promise<void> => {
        if (target.length > INLINE_APPROVAL_TARGET) {
          await this.client.sendMessage(
            chatId,
            formatApprovalArgumentDetails(request, target),
          );
        }
        await this.client.sendKeyboard(
          chatId,
          formatApprovalRequest(request, target),
          [[
            { text: "✅ Einmal erlauben", callback_data: `ok:${token}` },
            { text: "❌ Ablehnen", callback_data: `no:${token}` },
          ]],
        );
      };
      void sendApproval().catch((error) => {
        settle({
          approved: false,
          reason: `could not deliver Telegram approval request: ${(error as Error).message}`,
        });
      });
    });
  }

  private cancelApprovalsForChat(chatId: number, reason: string): void {
    for (const pending of [...this.pendingApprovals.values()]) {
      if (pending.chatId === chatId) pending.resolve({ approved: false, reason });
    }
  }

  private async runForChat(session: ChatSession, signal: AbortSignal) {
    const primary = session.model || this.config.model || FALLBACK_MODEL;
    const config = this.buildConfig(primary);
    const ctx = detectProject(session.cwd);
    const lastUser = [...session.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const recall = this.brain.recallText(lastUser, 4);
    const systemPrompt = this.systemPrefix() + buildSystemPrompt(ctx) + TELEGRAM_SYSTEM_SUFFIX + (recall ? `\n\n${recall}` : "");
    const messages: Message[] = [{ role: "system", content: systemPrompt }, ...session.messages];
    return runAgent(messages, config, session.cwd, {
      signal,
      maxTurns: this.config.maxTurns,
      streamFn: this.buildStreamFn(primary),
      textToolExecFn: this.textToolExecFn,
      onApproval: (request) => this.requestApproval(session.chatId, request, signal),
    });
  }

  /** /parallel — fan out several tasks to concurrent agents and aggregate. */
  private async handleParallel(chatId: number, rawArg: string): Promise<void> {
    const tasks = parseTasks(rawArg);
    if (tasks.length < 2) {
      return void this.client.sendMessage(chatId, "Nutzung: /parallel <Aufgabe 1>\n<Aufgabe 2>\n…  (min. 2 Zeilen, max 5)");
    }
    if (this.active.has(chatId)) {
      return void this.client.sendMessage(chatId, "⏳ Ich arbeite noch. /stop zum Abbrechen.");
    }
    const controller = new AbortController();
    this.active.set(chatId, { controller });
    await this.client.sendChatAction(chatId, "typing");
    const heartbeat = setInterval(() => void this.client.sendChatAction(chatId, "typing"), 4000);

    try {
      const session = this.store.get(chatId);
      const primary = session.model || this.config.model || FALLBACK_MODEL;
      const config = this.buildConfig(primary);
      const ctx = detectProject(session.cwd);
      const sys = this.systemPrefix() + buildSystemPrompt(ctx) + TELEGRAM_SYSTEM_SUFFIX;
      await this.client.sendMessage(chatId, `🧩 Starte ${Math.min(tasks.length, 5)} parallele Agenten…`);
      const { results, dropped } = await runParallel(tasks, config, session.cwd, {
        maxTurns: this.config.maxTurns,
        signal: controller.signal,
        streamFn: this.buildStreamFn(primary),
        onApproval: (request) => this.requestApproval(chatId, request, controller.signal),
        buildMessages: (p) => [{ role: "system", content: sys }, { role: "user", content: p }],
      });
      await this.client.sendMessage(chatId, formatParallelResults(results, dropped), "Markdown");
    } catch (e) {
      await this.client.sendMessage(chatId, `❌ Fehler: ${(e as Error).message}`);
    } finally {
      this.cancelApprovalsForChat(chatId, "parallel run ended before approval");
      clearInterval(heartbeat);
      this.active.delete(chatId);
    }
  }

  /** Carry's persona block (SOUL/USER/MEMORY/AGENTS), reloaded per request so edits apply live. */
  private systemPrefix(): string {
    const persona = loadPersona(this.personaDir);
    return persona ? `${persona}\n\n` : "";
  }

  /** Resilient stream over the model fallback chain (or the injected test stream). */
  private buildStreamFn(primaryModel: string): StreamFn {
    if (this.streamFn) return this.streamFn;
    // Fallbacks are a global-config opt-in. An omitted list must never move a
    // local/private conversation to a hosted provider.
    const fallbacks = this.config.fallbackModels ?? [];
    const chain = pickModelChain(primaryModel, fallbacks, (m) => Boolean(this.getStoredApiKey(detectProvider(m))));
    return createResilientStream(chain, (m) => this.buildConfig(m), realStreamChat, (f, n, e) => this.log(`fallback ${f}→${n}: ${e}`));
  }

  private buildConfig(modelOverride?: string): CLIConfig {
    const saved = loadSavedConfig();
    const model = modelOverride || this.config.model || (saved.model as string) || FALLBACK_MODEL;
    const provider = detectProvider(model);
    return {
      apiKey: this.getStoredApiKey(provider),
      model,
      provider,
      baseUrl: getProviderBaseUrl(provider),
      maxTokens: 8192,
      autoKnowledge: true,
      temperature: 0.6,
      maxTurns: this.config.maxTurns,
    };
  }

  // ─── Cron + distillation ───────────────────────────────────────────────────

  private async tickCron(): Promise<void> {
    const now = new Date();
    if (this.config.distillEnabled && this.config.distillSchedule) {
      const today = now.toISOString().slice(0, 10);
      let matches = false;
      try { matches = cronMatches(this.config.distillSchedule, now); } catch { matches = false; }
      if (matches && this.lastDistillDay !== today) {
        this.lastDistillDay = today;
        const owner = this.config.allowedUsers[0];
        if (owner) void this.runDistillation(owner);
      }
    }

    let due;
    try {
      due = dueJobs(loadJobs(), now);
    } catch {
      return;
    }
    for (const job of due) {
      if (this.cronRunning.has(job.id)) continue;
      this.cronRunning.add(job.id);
      recordRun(job.id);
      void this.runCronJob(job).finally(() => this.cronRunning.delete(job.id));
    }
  }

  private async runCronJob(job: { id: string; name: string; prompt: string; cwd: string; chatId: number }): Promise<void> {
    this.log(`cron fire: ${job.name} (${job.id})`);
    try {
      const config = this.buildConfig();
      const ctx = detectProject(job.cwd);
      const messages: Message[] = [
        { role: "system", content: this.systemPrefix() + buildSystemPrompt(ctx) + TELEGRAM_SYSTEM_SUFFIX },
        { role: "user", content: job.prompt },
      ];
      const result = await runAgent(messages, config, job.cwd, {
        maxTurns: this.config.maxTurns,
        streamFn: this.buildStreamFn(config.model),
        textToolExecFn: this.textToolExecFn,
        onApproval: (request) => this.requestApproval(job.chatId, request),
      });
      await this.client.sendMessage(job.chatId, `⏰ *${job.name}*\n\n${result.finalText || "(kein Output)"}`, "Markdown");
    } catch (e) {
      await this.client.sendMessage(job.chatId, `⏰ ${job.name} — ❌ Fehler: ${(e as Error).message}`);
    }
  }

  /** Distill the day's task outcomes into durable lessons stored back in the brain. */
  private async runDistillation(chatId: number): Promise<void> {
    const DAY_MS = 86_400_000;
    const outcomes = this.brain.recent("outcome", DAY_MS).map((m) => m.text);
    if (outcomes.length === 0) {
      return void this.client.sendMessage(chatId, "🌙 Lern-Destillation: heute keine Aufgaben.");
    }
    this.log(`distillation: ${outcomes.length} outcomes`);
    try {
      const config = this.buildConfig(this.config.model || FALLBACK_MODEL);
      const messages: Message[] = [
        { role: "system", content: DISTILL_SYSTEM_PROMPT },
        { role: "user", content: buildDistillPrompt(outcomes) },
      ];
      const result = await runAgent(messages, config, this.config.defaultCwd!, {
        maxTurns: 1,
        streamFn: this.buildStreamFn(config.model),
        textToolExecFn: this.textToolExecFn,
        onApproval: (request) => this.requestApproval(chatId, request),
      });
      const lessons = parseDistillation(result.finalText);
      for (const lesson of lessons) this.brain.remember(lesson, "decision", ["distilled"]);
      await this.client.sendMessage(chatId, formatDistillReport(lessons, outcomes.length), "Markdown");
    } catch (e) {
      await this.client.sendMessage(chatId, `🌙 Distillation-Fehler: ${(e as Error).message}`);
    }
  }

  private async handleCron(chatId: number, arg: string): Promise<void> {
    const { renderCronCommand } = await import("./cron-commands.js");
    const reply = renderCronCommand(chatId, arg, this.store.get(chatId).cwd);
    await this.client.sendMessage(chatId, reply);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private statusText(session: ChatSession): string {
    const model = session.model || this.config.model || "(default)";
    return [
      "📊 *Status*",
      `Modell: ${model}`,
      `Verzeichnis: ${session.cwd}`,
      `Verlauf: ${session.messages.length} Nachrichten`,
      `Erinnerungen: ${this.brain.count()}`,
      `Aktive Crons: ${loadJobs().filter((j) => j.enabled).length}`,
    ].join("\n");
  }

  private log(msg: string): void {
    process.stdout.write(`[gateway ${new Date().toISOString()}] ${msg}\n`);
  }
}

function stableApprovalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableApprovalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableApprovalValue(nested)]),
    );
  }
  return value;
}

function approvalTarget(request: ToolApprovalRequest): string {
  const args = request.invocation.args;
  if (request.invocation.name.startsWith("mcp__")) {
    try {
      return JSON.stringify(stableApprovalValue(args));
    } catch {
      return "";
    }
  }
  for (const key of ["command", "filePath", "dirPath", "url", "query", "pattern", "taskId", "raw"]) {
    const value = args[key];
    if (typeof value === "string") return value;
  }
  try {
    return JSON.stringify(args);
  } catch {
    return "";
  }
}

function approvalHash(target: string): string {
  return createHash("sha256").update(target).digest("hex").slice(0, 16);
}

function formatApprovalRequest(
  request: ToolApprovalRequest,
  target = approvalTarget(request) || "(kein Ziel angegeben)",
): string {
  const targetLine = target.length > INLINE_APPROVAL_TARGET
    ? `Vollständige Argumente: vorherige Nachricht (${target.length} Zeichen, sha256:${approvalHash(target)})`
    : `Ziel: ${escapeApprovalDisplay(target)}`;
  return [
    "🔐 Freigabe erforderlich",
    `Risiko: ${request.verdict.risk.toUpperCase()}`,
    `Tool: ${request.invocation.name}`,
    `Grund: ${request.verdict.reason}`,
    targetLine,
    "",
    "Diese Freigabe gilt genau einmal für diese Aktion.",
  ].join("\n");
}

function formatApprovalArgumentDetails(
  request: ToolApprovalRequest,
  target: string,
): string {
  return [
    "🔎 Vollständige Freigabe-Argumente",
    `Risiko: ${request.verdict.risk.toUpperCase()}`,
    `Tool: ${request.invocation.name}`,
    `Grund: ${request.verdict.reason}`,
    `Länge: ${target.length} Zeichen`,
    `SHA-256: ${approvalHash(target)}`,
    "",
    escapeApprovalDisplay(target),
  ].join("\n");
}

function formatOversizedApprovalRejection(
  request: ToolApprovalRequest,
  target: string,
): string {
  return [
    "⛔ Aktion automatisch abgelehnt",
    `Risiko: ${request.verdict.risk.toUpperCase()}`,
    `Tool: ${request.invocation.name}`,
    `Grund: Freigabe-Argumente sind mit ${target.length} Zeichen zu gross.`,
    `SHA-256: ${approvalHash(target)}`,
    `Grenze: ${MAX_TELEGRAM_APPROVAL_TARGET} Zeichen`,
  ].join("\n");
}

const TELEGRAM_SYSTEM_SUFFIX = `

Du läufst gerade als Remote-Agent über Telegram. Halte Antworten kompakt und auf den Punkt (Mobile-Bildschirm). Du hast Tool-Zugriff über <tool:...>-Aufrufe: read, write, edit, delete, bash, grep, glob, ls, git, web, fetch, gh, notebook_edit, bg_status, bg_list, verify, skill, vault und jerry. Dynamisch verbundene MCP-Tools erscheinen unter ihrem exakten mcp__... Namen und durchlaufen dieselbe Genehmigung. Führe Aufgaben eigenständig zu Ende und melde am Schluss kurz, was du getan hast. VERIFIKATION: Nach Code-Änderungen rufst du <tool:verify></tool> auf (läuft typecheck/lint/test/build + git diff) und meldest „done" NUR wenn die Checks grün sind — sonst nennst du den Blocker.

SUPERBRAIN: Wenn ein QMD/Obsidian-Vault konfiguriert ist, nutze <tool:vault>search <stichworte></tool> (BM25), vsearch (semantisch) oder get <pfad>, bevor du bei Fehlern und Architekturfragen fehlenden Kontext behauptest. LOKALE SKILLS: <tool:skill>list</tool> / search <q> / load <name> — wiederverwendbare, lokal installierte Prozeduren.

REMOTE-AGENT: Das Legacy-Tool <tool:jerry>klare Aufgabe</tool> delegiert eine exakt begrenzte Aufgabe an einen optional konfigurierten Hermes-kompatiblen Remote-Agenten. Nutze es nur, wenn die lokale Runtime eine notwendige Fähigkeit nicht besitzt. Remote-Aufrufe durchlaufen die normale Permission-Policy; sende niemals Secrets oder mehr Kontext als für die Aufgabe erforderlich. Für Coding im aktuellen Repo bleibst du selbst zuständig.`;

const HELP_TEXT = `🌟 *Carry* — dein Coding-Agent

Schreib mir einfach eine Coding-Aufgabe (Text oder Sprachnachricht) — ich arbeite sie mit vollem Tool-Zugriff in deinem Arbeitsverzeichnis ab.

Befehle:
/new — Kontext zurücksetzen
/status — Modell, Verzeichnis, Verlauf
/model — Modell-Auswahl als Buttons (oder /model <id> direkt)
/cwd <pfad> — Arbeitsverzeichnis setzen
/stop — laufenden Auftrag abbrechen
/cron — geplante Jobs verwalten (/cron help)
/parallel — mehrere Aufgaben parallel (eine pro Zeile)
/remember <text> — etwas dauerhaft merken
/recall <suche> — Gedächtnis durchsuchen
/distill — heutige Arbeit zu Lektionen destillieren
/whoami — wer ich bin (SOUL/USER/MEMORY/AGENTS)
/help — diese Hilfe`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Entry point used by the CLI subcommand. */
export async function startGateway(): Promise<void> {
  const config = loadTelegramConfig();
  if (!config.token) {
    console.error("❌ Kein Telegram-Token. Setze TELEGRAM_BOT_TOKEN oder ~/.morningstar/telegram.json.");
    process.exit(1);
  }
  if (config.allowedUsers.length === 0) {
    console.error("⚠️  Keine erlaubten User (TELEGRAM_ALLOWED_USERS). Der Bot würde alle ablehnen. Abbruch.");
    process.exit(1);
  }
  const gateway = new TelegramGateway(config);
  await gateway.start();
}
