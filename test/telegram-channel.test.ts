import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TelegramChannel } from "../src/telegram/channel.js";
import { TelegramAccess } from "../src/telegram/channel-access.js";
import type { RemoteSnapshot, RemoteAction } from "../src/remote-control.js";
import type { InlineButton, TelegramUpdate } from "../src/telegram/api.js";

function fixture(t: TestContext, users = [42]) {
  const root = mkdtempSync(join(tmpdir(), "morningstar-channel-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const sent: { chat: number; text: string; buttons?: InlineButton[][] }[] = [], actions: RemoteAction[] = [], prompts: string[] = [];
  const state: RemoteSnapshot = { id: "session-a", name: "Fixture", model: "fixture", project: root, busy: false, stream: "", messages: [], agents: [], work: [], approval: null };
  let complete: (() => void) | undefined, downloads = 0;
  const client = {
    getMe: async () => ({ id: 7, is_bot: true, username: "fixture_bot" }), getWebhookInfo: async () => ({ url: "", pending_update_count: 0 }), getUpdates: async () => [],
    sendMessage: async (chat: number, text: string) => { sent.push({ chat, text }); return sent.length; },
    sendKeyboard: async (chat: number, text: string, buttons: InlineButton[][]) => { sent.push({ chat, text, buttons }); return sent.length; },
    editMessageText: async (_chat: number, _id: number, text: string) => { sent.push({ chat: _chat, text }); },
    answerCallbackQuery: async () => {}, sendChatAction: async () => {},
    getFile: async () => { downloads++; return { file_path: "photos/test.jpg" }; }, downloadFile: async () => Buffer.from("invalid image"),
  };
  const notices: { text: string; running: boolean }[] = [];
  const channel = new TelegramChannel({ token: "fixture-token", allowedUsers: users, root, client, snapshot: () => state,
    action: action => { actions.push(action); }, notice: text => { notices.push({ text, running: channel.running }); },
    message: async text => { prompts.push(text); state.busy = true; state.messages.push({ role: "user", content: text }); await new Promise<void>(r => { complete = r; }); state.messages.push({ role: "assistant", content: "Shared-session result" }); state.busy = false; },
  });
  t.after(() => channel.stop());
  const update = (id: number, text: string, user = 42, type = "private"): TelegramUpdate => ({ update_id: id, message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: user, type }, from: { id: user, is_bot: false }, text } });
  return { channel, state, sent, actions, prompts, update, root, client, notices, downloads: () => downloads, finish: async () => { complete?.(); await new Promise(r => setTimeout(r, 0)); await channel.tick(); } };
}

test("Telegram routes allowed DMs into one existing session and returns its result without executing local commands", async t => {
  const f = fixture(t); await f.channel.start(false);
  await f.channel.handle(f.update(1, "!echo do-not-run-as-local-command"));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(f.prompts, ["[Telegram] !echo do-not-run-as-local-command"]);
  await f.channel.handle(f.update(1, "replayed")); assert.equal(f.prompts.length, 1);
  await f.finish(); assert.ok(f.sent.some(s => s.text === "Shared-session result"));
  assert.equal(f.state.id, "session-a");
});

test("unknown users, groups, bots, old updates and unpaired attachments never reach tools or downloads", async t => {
  const f = fixture(t); await f.channel.start(false);
  await f.channel.handle(f.update(1, "private data", 43));
  await f.channel.handle(f.update(2, "group data", 42, "group"));
  const old = f.update(3, "old queued task"); old.message!.date -= 120; await f.channel.handle(old);
  const bot = f.update(4, "bot task"); bot.message!.from!.is_bot = true; await f.channel.handle(bot);
  const photo = f.update(5, "", 43); photo.message!.photo = [{ file_id: "untrusted", width: 1, height: 1 }]; await f.channel.handle(photo);
  assert.equal(f.prompts.length, 0); assert.equal(f.downloads(), 0); assert.equal(f.sent.length, 0);
});

test("pairing is local, single-use and switches to allowlist; expires and rate limits requests", async t => {
  const f = fixture(t, []); await f.channel.start(false);
  await f.channel.handle(f.update(1, "hello"));
  const code = f.sent[0].text.match(/pair ([A-F0-9]{8})/)![1];
  await f.channel.handle(f.update(2, `/telegram:access pair ${code}`)); assert.equal(f.prompts.length, 0);
  assert.equal(f.sent.length, 1); assert.equal(f.channel.access.pair(code), 42);
  assert.equal(f.channel.access.state.policy, "allowlist"); assert.throws(() => f.channel.access.pair(code));
  const reloaded = new TelegramAccess("fixture-token", [], f.root); assert.equal(reloaded.allowed(42, 42, "private"), true);
  reloaded.revoke(42); assert.equal(reloaded.allowed(42, 42, "private"), false);
  let time = 0; const expiring = new TelegramAccess("other-token", [], f.root, () => time);
  const expired = expiring.request(5, 5)!; time = 600001; assert.throws(() => expiring.pair(expired));
});

test("approval callbacks are bound to owner, session and the current request, and are single-use", async t => {
  const f = fixture(t); await f.channel.start(false); await f.channel.handle(f.update(1, "perform task"));
  await new Promise(r => setTimeout(r, 0));
  f.state.approval = { id: "approval-a", tool: "write", target: "file.txt", reason: "Needs permission" }; await f.channel.tick();
  const button = f.sent.find(s => s.buttons?.[0]?.[0]?.text === "Einmal erlauben")!.buttons![0][0];
  const click = (id: number, user: number): TelegramUpdate => ({ update_id: id, callback_query: { id: String(id), data: button.callback_data, from: { id: user, is_bot: false }, message: { message_id: 12, date: 0, chat: { id: 42, type: "private" } } } });
  await f.channel.handle(click(2, 43)); assert.equal(f.actions.length, 0);
  await f.channel.handle(click(3, 42)); assert.equal(f.actions[0].type, "approve"); assert.equal(f.actions[0].approvalId, "approval-a");
  await f.channel.handle(click(4, 42)); assert.equal(f.actions.length, 1);
  f.state.approval = { ...f.state.approval, id: "approval-b" }; await f.channel.tick();
  const stale = f.sent.filter(s => s.buttons?.[0]?.[0]?.text === "Einmal erlauben").at(-1)!.buttons![0][0].callback_data;
  f.state.id = "session-b"; const next = click(5, 42); next.callback_query!.data = stale; await f.channel.handle(next); assert.equal(f.actions.length, 1);
  await f.finish();
});

test("busy prompts queue, stopping clears the queue, and duplicate bot consumers are rejected", async t => {
  const f = fixture(t); await f.channel.start(false);
  const other = new TelegramAccess("fixture-token", [42], f.root); assert.throws(() => other.acquire(), /bereits/);
  await f.channel.handle(f.update(1, "first")); await new Promise(r => setTimeout(r, 0));
  await f.channel.handle(f.update(2, "second")); assert.equal(f.prompts.length, 1);
  await f.channel.handle(f.update(3, "/stop")); assert.equal(f.actions.at(-1)?.type, "stop");
  await f.finish(); await f.channel.tick(); assert.equal(f.prompts.length, 1);
  f.channel.stop(); const release = other.acquire(); release();
});

test("terminal-origin work relays progress and approvals after an authorized status request", async t => {
  const f = fixture(t); await f.channel.start(false); await f.channel.handle(f.update(1, "/status"));
  f.state.busy = true; await f.channel.tick();
  f.state.approval = { id: "local-approval", tool: "edit", target: "code.ts", reason: "Review edit" }; await f.channel.tick();
  assert.ok(f.sent.some(s => s.buttons?.[0][0].text === "Einmal erlauben"));
  f.state.messages.push({ role: "assistant", content: "Terminal task result" }); f.state.busy = false; f.state.approval = null;
  await f.channel.tick(); assert.ok(f.sent.some(s => s.text === "Terminal task result")); assert.equal(f.prompts.length, 0);
});

test("stopping during an attachment download prevents a deferred prompt from starting", async t => {
  const f = fixture(t); let download!: (value: Buffer) => void;
  f.client.downloadFile = async () => new Promise<Buffer>(resolve => { download = resolve; });
  await f.channel.start(false);
  const input = f.update(1, "read this"); input.message!.document = { file_id: "text", mime_type: "text/plain", file_name: "notes.txt" };
  await f.channel.handle(input); await new Promise(r => setTimeout(r, 0));
  await f.channel.handle(f.update(2, "/stop")); download(Buffer.from("delayed content"));
  await new Promise(r => setTimeout(r, 0)); await f.channel.tick();
  assert.equal(f.prompts.length, 0); assert.equal(f.actions.at(-1)?.type, "stop");
});

test("paired channel tools send workspace files, react and edit only own message IDs; policy still applies", async t => {
  const { writeFileSync, symlinkSync } = await import("node:fs");
  const { executeTelegramTool, getTelegramToolDefinitions } = await import("../src/telegram/channel-tools.js");
  const { decidePermission } = await import("../src/policy-engine.js");
  const { executeNativeToolCall, executeToolCall, parseToolCalls } = await import("../src/tools.js");
  const f = fixture(t); const uploads: string[] = [], edits: number[] = [], reactions: string[] = [];
  Object.assign(f.client, {
    sendFile: async (chat: number, name: string, bytes: Buffer) => { assert.equal(chat, 42); uploads.push(name + ':' + bytes.toString()); return 88; },
    react: async (_chat: number, _id: number, emoji: string) => { reactions.push(emoji); },
    editOwnMessage: async (_chat: number, id: number) => { edits.push(id); },
  });
  await f.channel.start(false); assert.equal(getTelegramToolDefinitions().length, 3);
  await f.channel.handle(f.update(1, "/status"));
  writeFileSync(join(f.root, "result.txt"), "verified output"); writeFileSync(join(f.root, ".env"), "SECRET");
  assert.equal((await executeTelegramTool("telegram_reply", { files: [".env"] }, f.root)).success, false);
  assert.equal((await executeTelegramTool("telegram_reply", { files: ["../outside.txt"] }, f.root)).success, false);
  if (process.platform !== "win32") { symlinkSync(join(f.root, '.env'), join(f.root, 'alias.txt')); assert.equal((await executeTelegramTool("telegram_reply", { files: ["alias.txt"] }, f.root)).success, false); }
  const sent = await executeNativeToolCall("telegram_reply", { files: ["result.txt"] }, f.root);
  assert.equal(sent.success, true); assert.deepEqual(uploads, ["result.txt:verified output"]);
  assert.equal((await executeTelegramTool("telegram_edit_message", { message_id: 9, text: "no" }, f.root)).success, false);
  assert.equal((await executeTelegramTool("telegram_edit_message", { message_id: 88, text: "Updated" }, f.root)).success, true);
  assert.deepEqual(edits, [88]); assert.equal((await executeToolCall(parseToolCalls('<tool:telegram_react>{"emoji":"👀"}</tool:telegram_react>').calls[0], f.root)).success, true); assert.deepEqual(reactions, ["👀"]);
  for (const mode of ["plan", "dontAsk"] as const) assert.equal(decidePermission("telegram_reply", "result.txt", mode).decision, "deny");
  assert.equal(decidePermission("telegram_reply", "result.txt", "auto").decision, "ask");
  f.channel.stop(); assert.equal(getTelegramToolDefinitions().length, 0);
  assert.equal((await executeTelegramTool("telegram_reply", { text: "after disconnect" }, f.root)).success, false);
});

test("an existing webhook prevents activation before polling and releases the session lock", async t => {
  const f = fixture(t); let polled = false;
  f.client.getWebhookInfo = async () => ({ url: "https://legacy.example/secret-route", pending_update_count: 2 });
  f.client.getUpdates = async () => { polled = true; return []; };
  await assert.rejects(f.channel.start(), /webhook/);
  assert.equal(f.channel.running, false); assert.equal(polled, false);
  const release = new TelegramAccess("fixture-token", [42], f.root).acquire(); release();
  const { telegramConnectionMessage } = await import("../src/telegram/connection-errors.js");
  const notice = telegramConnectionMessage(new Error("409: webhook active https://legacy.example/secret-route"));
  assert.match(notice, /Webhook aktiv/); assert.doesNotMatch(notice, /secret-route|legacy\.example/);
});

test("poll conflicts mark the channel offline before notifying the footer", async t => {
  const f = fixture(t); f.client.getUpdates = async () => { throw new Error("409 Conflict: terminated by other getUpdates request"); };
  await f.channel.start(); await new Promise(r => setTimeout(r, 0));
  assert.equal(f.channel.running, false);
  assert.equal(f.notices.length, 1); assert.equal(f.notices[0].running, false); assert.match(f.notices[0].text, /anderen Sitzung/);
  const { getTelegramToolDefinitions } = await import("../src/telegram/channel-tools.js");
  assert.equal(getTelegramToolDefinitions().length, 0);
  const { telegramConnectionMessage } = await import("../src/telegram/connection-errors.js");
  assert.match(telegramConnectionMessage(new Error("401 Unauthorized")), /Token ungültig/);
  assert.match(telegramConnectionMessage(new Error("409 Conflict")), /anderen Sitzung/);
  assert.doesNotMatch(telegramConnectionMessage(new Error("network failure https://api.telegram.org/botSECRET")), /SECRET/);
});
