import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { TelegramGateway } from "../src/telegram/gateway.js";
import type { TelegramClient, TelegramUpdate } from "../src/telegram/api.js";
import type { TelegramConfig } from "../src/telegram/config.js";
import type { StreamFn } from "../src/agent-runner.js";
import type { Brain } from "../src/brain/store.js";
import { MODEL_MENU } from "../src/telegram/models-menu.js";

/** In-memory fake brain capturing remembered texts. */
function fakeBrain(remembered: string[] = [], outcomes: string[] = []): Brain {
  return {
    remember: (text: string) => { remembered.push(text); return { id: "x", text, kind: "note", tags: [], createdAt: 0 }; },
    recall: () => [],
    recallText: (q: string) => (remembered.find((r) => r.includes(q)) ? `hit: ${q}` : ""),
    recent: (kind: string) => (kind === "outcome" ? outcomes.map((t) => ({ id: "o", text: t, kind: "outcome", tags: [], createdAt: 0 })) : []),
    count: () => remembered.length,
  } as unknown as Brain;
}

interface Sent { chatId: number; text: string; keyboard?: unknown }

function fakeClient(sent: Sent[], answers: string[] = []): TelegramClient {
  return {
    getMe: async () => ({ id: 1, is_bot: true, username: "test_bot" }),
    getUpdates: async () => [],
    sendChatAction: async () => {},
    sendMessage: async (chatId: number, text: string) => { sent.push({ chatId, text }); return 1; },
    sendKeyboard: async (chatId: number, text: string, keyboard: unknown) => { sent.push({ chatId, text, keyboard }); return 1; },
    answerCallbackQuery: async (_id: string, text?: string) => { answers.push(text ?? ""); },
    editMessageText: async () => {},
    getFile: async () => ({ file_path: "voice/v1.ogg" }),
    downloadFile: async () => Buffer.from("fake-audio-bytes"),
  } as unknown as TelegramClient;
}

function voiceUpdate(userId: number, chatId = userId): TelegramUpdate {
  return { update_id: Math.floor(Math.random() * 1e9), message: { message_id: 7, from: { id: userId, is_bot: false }, chat: { id: chatId, type: "private" }, date: 0, voice: { file_id: "v1", mime_type: "audio/ogg" } } };
}

function callbackUpdate(userId: number, data: string, chatId = userId): TelegramUpdate {
  return { update_id: Math.floor(Math.random() * 1e9), callback_query: { id: "cb1", from: { id: userId, is_bot: false }, data, message: { message_id: 5, chat: { id: chatId, type: "private" }, date: 0 } } };
}

const fixedReply: StreamFn = async function* () {
  yield { type: "content", text: "Erledigt." };
};

function config(): TelegramConfig {
  return { token: "x", allowedUsers: [42], model: "fake", defaultCwd: tmpdir(), maxTurns: 3, historyLimit: 20 };
}

function update(userId: number, text: string, chatId = userId): TelegramUpdate {
  return { update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, from: { id: userId, is_bot: false }, chat: { id: chatId, type: "private" }, date: 0, text } };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for test condition");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

test("authorized user gets an agent reply", async () => {
  const sent: Sent[] = [];
  const remembered: string[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain(remembered) });
  await gw.processUpdate(update(42, "baue mir was"));
  assert.ok(sent.some((s) => s.text.includes("Erledigt.")));
  assert.ok(remembered.some((r) => r.includes("baue mir was")));
});

test("unauthorized user is rejected", async () => {
  const sent: Sent[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain() });
  await gw.processUpdate(update(99, "lass mich rein"));
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.includes("Nicht autorisiert"));
});

test("/help returns the help text", async () => {
  const sent: Sent[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain() });
  await gw.processUpdate(update(42, "/help"));
  assert.ok(sent[0].text.includes("Carry"));
});

test("/whoami identifies as Carry", async () => {
  const sent: Sent[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain() });
  await gw.processUpdate(update(42, "/whoami"));
  assert.ok(sent[0].text.includes("Carry"));
});

test("/status reports model and cwd", async () => {
  const sent: Sent[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain() });
  await gw.processUpdate(update(42, "/status"));
  assert.ok(sent[0].text.includes("Status"));
  assert.ok(sent[0].text.includes(tmpdir()));
});

test("/model without arg shows the picker keyboard", async () => {
  const sent: Sent[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain() });
  await gw.processUpdate(update(42, "/model"));
  assert.ok(sent[0].keyboard);
  const rows = sent[0].keyboard as Array<Array<{ callback_data: string }>>;
  assert.ok(rows.flat().some((b) => b.callback_data === "m:0"));
});

test("tapping a model button switches the model", async () => {
  const sent: Sent[] = [];
  const answers: string[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent, answers), streamFn: fixedReply, brain: fakeBrain() });
  const idx = MODEL_MENU.findIndex((m) => m.model === "deepseek-chat");
  await gw.processUpdate(callbackUpdate(42, `m:${idx}`));
  assert.ok(answers.some((a) => a.includes("deepseek-chat")));
  assert.ok(sent.some((s) => s.text.includes("Modell gewechselt") && s.text.includes("deepseek-chat")));
});

test("/remember stores a memory", async () => {
  const sent: Sent[] = [];
  const remembered: string[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain(remembered) });
  await gw.processUpdate(update(42, "/remember die DB läuft auf der NAS"));
  assert.ok(remembered.includes("die DB läuft auf der NAS"));
  assert.ok(sent[0].text.includes("Gemerkt"));
});

test("/recall searches memory", async () => {
  const sent: Sent[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain(["NAS Postgres"]) });
  await gw.processUpdate(update(42, "/recall NAS"));
  assert.ok(sent[0].text.includes("hit: NAS"));
});

const DESTRUCTIVE_COMMAND = "rm -rf /tmp/morningstar-nonexistent-xyz";

function destructiveThenDone(): StreamFn {
  const responses = [
    `Ich räume auf.\n<tool:bash>${DESTRUCTIVE_COMMAND}</tool>`,
    "Erledigt.",
  ];
  return async function* () {
    yield { type: "content", text: responses.shift() ?? "Erledigt." };
  };
}

test("agent approval displays exact action details and supports denial", async () => {
  const sent: Sent[] = [];
  const answers: string[] = [];
  let executions = 0;
  const gw = new TelegramGateway(config(), {
    client: fakeClient(sent, answers),
    streamFn: destructiveThenDone(),
    brain: fakeBrain(),
    textToolExecFn: async (call) => {
      executions++;
      return { tool: call.tool, result: "should not execute", success: true };
    },
  });

  const run = gw.processUpdate(update(42, "räum /tmp auf"));
  await waitFor(() => sent.some((s) => Boolean(s.keyboard)));
  const approval = sent.find((s) => s.keyboard);
  assert.ok(approval, "expected an approval keyboard");
  assert.match(approval.text, /Tool: bash/);
  assert.ok(approval.text.includes(`Ziel: ${DESTRUCTIVE_COMMAND}`));
  assert.match(approval.text, /Risiko: HIGH/);
  assert.match(approval.text, /Grund: .*approval/i);

  const buttons = (approval!.keyboard as Array<Array<{ callback_data: string }>>).flat();
  const deny = buttons.find((button) => button.callback_data.startsWith("no:"));
  assert.ok(deny);

  await gw.processUpdate(callbackUpdate(42, deny!.callback_data));
  await run;

  assert.equal(executions, 0);
  assert.ok(answers.some((answer) => answer.includes("Abgelehnt")));
  assert.ok(sent.some((message) => message.text.includes("abgelehnt")));
});

test("long MCP approval sends complete arguments before the bounded keyboard summary", async () => {
  const sent: Sent[] = [];
  const longValue = `recipient=admin@example.test;${"x".repeat(5_000)};delete=true`;
  let firstTurn = true;
  const streamFn: StreamFn = async function* () {
    if (!firstTurn) {
      yield { type: "content", text: "done" };
      return;
    }
    firstTurn = false;
    yield {
      type: "tool_call",
      text: "",
      toolCall: {
        id: "mcp-long",
        name: "mcp__trusted__mutate__0000000000000000",
        arguments: JSON.stringify({ payload: longValue }),
      },
    };
  };
  const gw = new TelegramGateway(config(), {
    client: fakeClient(sent),
    streamFn,
    brain: fakeBrain(),
  });

  const run = gw.processUpdate(update(42, "mcp action"));
  await waitFor(() => sent.some((message) => Boolean(message.keyboard)));
  const details = sent.find((message) =>
    message.text.includes("Vollständige Freigabe-Argumente"));
  const keyboard = sent.find((message) => Boolean(message.keyboard));
  assert.ok(details);
  assert.ok(keyboard);
  assert.ok(details.text.includes(longValue));
  assert.match(details.text, /SHA-256: [a-f0-9]{16}/);
  assert.match(keyboard.text, /^🔐 Freigabe erforderlich\nRisiko: HIGH/);
  assert.match(keyboard.text, /Vollständige Argumente: vorherige Nachricht/);

  const deny = (keyboard.keyboard as Array<Array<{ callback_data: string }>>)
    .flat()
    .find((button) => button.callback_data.startsWith("no:"));
  assert.ok(deny);
  await gw.processUpdate(callbackUpdate(42, deny!.callback_data));
  await run;
});

test("allow-once resumes the same run and an expired callback cannot execute again", async () => {
  const sent: Sent[] = [];
  const answers: string[] = [];
  let executions = 0;
  const gw = new TelegramGateway(config(), {
    client: fakeClient(sent, answers),
    streamFn: destructiveThenDone(),
    brain: fakeBrain(),
    textToolExecFn: async (call) => {
      executions++;
      return { tool: call.tool, result: "executed once", success: true };
    },
  });

  const run = gw.processUpdate(update(42, "räum /tmp auf"));
  await waitFor(() => sent.some((s) => Boolean(s.keyboard)));
  const approval = sent.find((s) => s.keyboard)!;
  const buttons = (approval.keyboard as Array<Array<{ callback_data: string }>>).flat();
  const allow = buttons.find((button) => button.callback_data.startsWith("ok:"));
  assert.ok(allow);

  await gw.processUpdate(callbackUpdate(42, allow!.callback_data));
  await run;

  assert.equal(executions, 1);
  assert.ok(answers.some((answer) => answer.includes("Einmal freigegeben")));
  assert.ok(sent.some((message) => message.text.includes("Erledigt.")));

  await gw.processUpdate(callbackUpdate(42, allow!.callback_data));
  assert.equal(answers.at(-1), "Abgelaufen.");
});

test("approval timeout denies fail-closed and removes the pending resolver", async () => {
  const sent: Sent[] = [];
  const answers: string[] = [];
  let executions = 0;
  const gw = new TelegramGateway(config(), {
    client: fakeClient(sent, answers),
    streamFn: destructiveThenDone(),
    brain: fakeBrain(),
    approvalTimeoutMs: 10,
    textToolExecFn: async (call) => {
      executions++;
      return { tool: call.tool, result: "should not execute", success: true };
    },
  });

  const run = gw.processUpdate(update(42, "räum /tmp auf"));
  await waitFor(() => sent.some((s) => Boolean(s.keyboard)));
  const approval = sent.find((s) => s.keyboard)!;
  const allow = (approval.keyboard as Array<Array<{ callback_data: string }>>)
    .flat()
    .find((button) => button.callback_data.startsWith("ok:"));
  assert.ok(allow);

  await run;

  assert.equal(executions, 0);
  assert.ok(sent.some((message) => message.text.includes("Freigabe abgelaufen")));

  await gw.processUpdate(callbackUpdate(42, allow!.callback_data));
  assert.equal(answers.at(-1), "Abgelaufen.");
});

test("/parallel fans out to multiple agents", async () => {
  const sent: Sent[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain() });
  await gw.processUpdate(update(42, "/parallel fix build\nwrite tests\nupdate docs"));
  const agg = sent.find((s) => s.text.includes("fix build"));
  assert.ok(agg);
  assert.ok(agg!.text.includes("write tests") && agg!.text.includes("update docs"));
});

test("/parallel with one task is rejected", async () => {
  const sent: Sent[] = [];
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain() });
  await gw.processUpdate(update(42, "/parallel nur eine aufgabe"));
  assert.ok(sent[0].text.includes("min. 2"));
});

test("session-changing commands are blocked while a run is active", async () => {
  const sent: Sent[] = [];
  let release!: () => void;
  const blockedReply: StreamFn = async function* () {
    await new Promise<void>((resolve) => { release = resolve; });
    yield { type: "content", text: "fertig" };
  };
  const gw = new TelegramGateway(config(), {
    client: fakeClient(sent),
    streamFn: blockedReply,
    brain: fakeBrain(),
  });

  const run = gw.processUpdate(update(42, "arbeite"));
  await waitFor(() => typeof release === "function");
  await gw.processUpdate(update(42, "/cwd /tmp"));
  assert.ok(sent.some((message) => message.text.includes("laufenden Auftrag")));
  release();
  await run;
});

test("an aborted Telegram turn is closed before the next prompt", async () => {
  const sent: Sent[] = [];
  let invocation = 0;
  let firstStarted = false;
  let secondMessages: Array<{ role: string; content: string }> = [];
  const abortThenReply: StreamFn = async function* (messages, _config, signal) {
    invocation++;
    if (invocation === 1) {
      firstStarted = true;
      await new Promise<void>((resolve) => {
        if (signal?.aborted) resolve();
        else signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      return;
    }
    secondMessages = messages;
    yield { type: "content", text: "Neuer Auftrag erledigt." };
  };
  const gw = new TelegramGateway(config(), {
    client: fakeClient(sent),
    streamFn: abortThenReply,
    brain: fakeBrain(),
  });

  const first = gw.processUpdate(update(42, "alter Auftrag"));
  await waitFor(() => firstStarted);
  await gw.processUpdate(update(42, "/stop"));
  await first;
  await gw.processUpdate(update(42, "neuer Auftrag"));

  const oldIndex = secondMessages.findIndex((message) => message.content === "alter Auftrag");
  assert.ok(oldIndex >= 0);
  assert.equal(secondMessages[oldIndex + 1]?.role, "assistant");
  assert.match(secondMessages[oldIndex + 1]?.content || "", /abgebrochen/i);
  assert.equal(secondMessages.at(-1)?.content, "neuer Auftrag");
});

test("/distill turns outcomes into stored lessons", async () => {
  const sent: Sent[] = [];
  const remembered: string[] = [];
  const bullets: StreamFn = async function* () {
    yield { type: "content", text: "- deepseek nutzt das Text-Tool-Format\n- tsc immer vor dem Commit laufen lassen" };
  };
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: bullets, brain: fakeBrain(remembered, ["Aufgabe: build fix → done"]) });
  await gw.processUpdate(update(42, "/distill"));
  assert.ok(sent.some((s) => s.text.includes("Lern-Destillation")));
  assert.ok(remembered.some((r) => r.includes("deepseek")));
});

test("voice message is transcribed and run as a prompt", async () => {
  const sent: Sent[] = [];
  const transcribe = async () => "baue mir eine landingpage";
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain(), transcribe });
  await gw.processUpdate(voiceUpdate(42));
  assert.ok(sent.some((s) => s.text.includes("baue mir eine landingpage")));
  assert.ok(sent.some((s) => s.text.includes("Erledigt.")));
});

test("voice transcription failure is reported", async () => {
  const sent: Sent[] = [];
  const transcribe = async () => { throw new Error("stt down"); };
  const gw = new TelegramGateway(config(), { client: fakeClient(sent), streamFn: fixedReply, brain: fakeBrain(), transcribe });
  await gw.processUpdate(voiceUpdate(42));
  assert.ok(sent.some((s) => s.text.includes("fehlgeschlagen")));
});
