import { request as httpRequest } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionController, type SessionStore } from "../src/session-controller.js";
import type { SavedConversation } from "../src/history.js";
import { startRemoteControl, privateAddress, type RemoteSnapshot } from "../src/remote-control.js";
import { composerLayout, composerOffset, terminalReport } from "../src/runtime/composer-layout.js";
import { parseBackendEvent } from "../src/providers/backend-events.js";
import { codexCliStream } from "../src/providers/codex-cli.js";
import { runAgent, type AgentLifecycleEvent } from "../src/agent-runner.js";

function memoryStore() {
  const data = new Map<string, SavedConversation>();
  const store: SessionStore = { save(name, messages, model, project, id = "fixture") { const value = structuredClone({ name, messages, model, project, id, savedAt: new Date().toISOString(), messageCount: messages.length }); data.set(id, value); return value; }, load(ref) { return structuredClone(data.get(ref) ?? [...data.values()].find(v => v.name === ref) ?? null); }, list: () => [...data.values()] };
  return { data, store };
}
test("new saves the old conversation with a different identity; resume refreshes system and rename survives new turns", () => {
  const { store, data } = memoryStore();
  const s = new SessionController("/project", "model", [{ role: "system", content: "old" }, { role: "user", content: "first" }], { store });
  const old = s.id; s.rename("One"); s.fresh("new system");
  assert.notEqual(s.id, old); assert.equal(data.get(old)?.name, "One"); assert.equal(s.messages.length, 1);
  s.update([...s.messages, { role: "user", content: "second" }]); const second = s.id; s.rename("Two"); s.save();
  s.resume(old, "fresh system"); assert.equal(s.id, old); assert.equal(s.messages[0].content, "fresh system"); assert.equal(s.messages[1].content, "first"); assert.equal(data.get(second)?.messages[1].content, "second");
  assert.throws(() => s.rename("\x1bmalicious"));
  s.project = "/other"; assert.throws(() => s.resume(second, "system"), /gehört/);
});
test("empty /new does not save empty chats and no persistence remains respected", () => {
  const { store, data } = memoryStore(); const s = new SessionController("/p", "m", [], { store, persist: false });
  s.update([{ role: "user", content: "x" }]); s.rename("Private"); s.fresh("system"); assert.equal(data.size, 0);
});
test("pointer coordinates select graphemes across wraps, including wide emoji and newlines", () => {
  const value = "ab👨‍👩‍👧‍👦中文\nz", rows = composerLayout(value, "> ", 8);
  assert.equal(composerOffset(rows, 2, 0), 0);
  assert.equal(composerOffset(rows, 5, 0), 2);
  assert.equal(composerOffset(rows, 0, 1), value.indexOf("文"));
  assert.equal(composerOffset(rows, 0, 2), value.indexOf("z"));
  assert.equal(terminalReport("[<0;12;8M"), true); assert.equal(terminalReport("[24;1R"), true); assert.equal(terminalReport("hello"), false);
});
const snapshot: RemoteSnapshot = { id: "fixture", name: "Fixture", model: "test", project: "/project", busy: false, stream: "", messages: [{ role: "user", content: "<script>never_execute()</script>" }], agents: [], work: [], approval: null };
test("remote control enforces pairing, exact origin/host, expiry, action schema, replay and stop", async () => {
  let now = 1000; const actions: string[] = [];
  const server = await startRemoteControl({ snapshot: () => snapshot, sessions: () => [], action: a => { actions.push(a.type); }, now: () => now });
  try {
    const base = server.url;
    const send = (path: string, data: unknown, cookie = "", origin = base) => fetch(base + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(data) });
    assert.equal((await fetch(base + "/api/state")).status, 401);
    assert.equal((await fetch(base + "/api/sessions")).status, 401);
    assert.equal(await new Promise(resolve => { const req = httpRequest(base + "/", { headers: { Host: "attacker.invalid" } }, res => { res.resume(); resolve(res.statusCode); }); req.end(); }), 403);
    assert.equal((await fetch(base + "/?token=leak")).status, 400);
    const token = new URL(server.pair().url).hash.slice(6);
    assert.equal((await send("/api/pair", { token }, "", "https://attacker.invalid")).status, 403);
    assert.equal((await send("/api/pair", { token: "wrong" })).status, 401);
    const paired = await send("/api/pair", { token }); assert.equal(paired.status, 200);
    const cookieHeader = paired.headers.get("set-cookie")!; assert.match(cookieHeader, /HttpOnly/); assert.match(cookieHeader, /SameSite=Strict/);
    const cookie = cookieHeader.split(";")[0];
    assert.equal((await send("/api/pair", { token })).status, 401);
    const state = await fetch(base + "/api/state", { headers: { Cookie: cookie } }); assert.deepEqual(await state.json(), snapshot); assert.match(state.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
    assert.equal((await fetch(base + "/api/state", { headers: { Cookie: cookie, "If-None-Match": state.headers.get("etag")! } })).status, 304);
    assert.equal((await send("/api/action", { id: "fixture-001", type: "message", text: "hello", bypass: true }, cookie)).status, 400);
    assert.equal((await send("/api/action", { id: "fixture-001", type: "message", text: "hello" }, cookie, "https://attacker.invalid")).status, 403);
    for (let i = 0; i < 2; i++) assert.equal((await send("/api/action", { id: "fixture-001", type: "message", text: "hello" }, cookie)).status, 200);
    assert.deepEqual(actions, ["message"]);
    assert.equal((await send("/api/action", { id: "fixture-002", type: "resume", sessionId: "../../etc/passwd" }, cookie)).status, 400);
    assert.equal((await send("/api/action", { id: "fixture-003", type: "message", text: "x".repeat(70000) }, cookie)).status, 400);
    const expiring = new URL(server.pair().url).hash.slice(6); now += 600001; assert.equal((await send("/api/pair", { token: expiring })).status, 401);
    for (let i = 0; i < 6; i++) await send("/api/pair", { token: "wrong" });
    assert.equal((await send("/api/pair", { token: "wrong" })).status, 429);
    now += 12 * 3600000; assert.equal((await fetch(base + "/api/state", { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await fetch(base + "/app.js")).status, 200);
    const markdown = await fetch(base + "/markdown.js");
    assert.equal(markdown.status, 200); assert.match(markdown.headers.get("content-type")!, /javascript/);
    assert.match(markdown.headers.get("content-security-policy")!, /script-src 'self'/);
    assert.match(await markdown.text(), /marked/);
    assert.equal((await fetch(base + "/package.json")).status, 401);
  } finally { await server.stop(); }
  assert.equal(server.running, false);
  assert.equal(privateAddress("0.0.0.0"), false); assert.equal(privateAddress("8.8.8.8"), false); assert.equal(privateAddress("100.102.178.104"), true);
  await assert.rejects(fetch(server.url + "/api/state"));
});
test("Codex public command/MCP/collab events pass through once, reasoning stays private and messages have paragraph boundaries", async () => {
  const events = [
    { type: "item.completed", item: { id: "private", type: "reasoning", text: "PRIVATE_REASONING" } },
    { type: "item.completed", item: { id: "a", type: "agent_message", text: "Checking." } },
    { type: "item.started", item: { id: "c", type: "command_execution", command: "printf PROBE", status: "in_progress" } },
    { type: "item.completed", item: { id: "c", type: "command_execution", command: "printf PROBE", aggregated_output: "PROBE", exit_code: 0, status: "completed" } },
    { type: "item.completed", item: { id: "m", type: "mcp_tool_call", server: "fixture", tool: "read", result: { content: [{ type: "text", text: "OK" }] }, status: "completed" } },
    { type: "item.completed", item: { id: "s", type: "collab_tool_call", tool: "spawn_agent", receiver_thread_ids: ["worker"], prompt: "inspect", agents_states: { worker: { status: "running" } }, status: "completed" } },
    { type: "item.completed", item: { id: "b", type: "agent_message", text: "Done." } },
  ];
  const runner = async function* () { for (const e of events) yield JSON.stringify(e) + "\n"; yield JSON.stringify(events[3]) + "\n"; };
  const seen: AgentLifecycleEvent[] = []; let executions = 0;
  const result = await runAgent([{ role: "user", content: "fixture" }], { apiKey: "test", model: "fixture", baseUrl: "http://localhost", maxTokens: 100, temperature: 0 }, "/tmp", { streamFn: () => codexCliStream(undefined, [], undefined, runner), nativeToolExecFn: async () => { executions++; throw new Error("must not execute observations"); }, onEvent: e => seen.push(e) });
  assert.equal(result.finalText, "Checking.\n\nDone."); assert.equal(executions, 0);
  const work = seen.filter(e => e.type === "backend_activity"); assert.equal(work.length, 4);
  assert.equal(JSON.stringify(seen).includes("PRIVATE_REASONING"), false);
  assert.throws(() => parseBackendEvent('{"type":"turn.failed","error":{"message":"failure"}}'), /failure/);
  const failed = parseBackendEvent('{"type":"item.completed","item":{"id":"x","type":"command_execution","exit_code":1,"status":"completed"}}'); assert.equal(failed?.activity?.result?.success, false);
});

 test("rewind preserves complete tool turns, summarizes only the selected range and never mutates the source", async () => {
  const { rewindConversation, rewindPoints } = await import("../src/runtime/rewind.js");
  const messages: import("../src/types.js").Message[] = [{role:"system",content:"rules"},{role:"user",content:"first"},{role:"assistant",content:"answer 1"},{role:"user",content:"second"},{role:"assistant",content:"answer 2"}];
  const original = JSON.stringify(messages), seen: string[][] = [];
  const summarize = async (m: typeof messages) => {seen.push(m.map(v=>v.content));return "SUMMARY";};
  assert.deepEqual(rewindPoints(messages).map(p=>p.index),[1,3]);
  const restored=await rewindConversation(messages,3,"restore",summarize);assert.equal(restored.draft,"second");assert.deepEqual(restored.messages,messages.slice(0,3));
  const from=await rewindConversation(messages,3,"summarize-from",summarize);assert.deepEqual(seen[0],["second","answer 2"]);assert.equal(from.messages.at(-1)?.contextKind,"summary");
  const until=await rewindConversation(messages,3,"summarize-until",summarize);assert.deepEqual(seen[1],["first","answer 1"]);assert.deepEqual(until.messages.slice(-2),messages.slice(-2));
  assert.equal(JSON.stringify(messages),original);
  await assert.rejects(rewindConversation(messages,2,"restore",summarize),/Ungültiger/);
  await assert.rejects(rewindConversation(messages,1,"summarize-until",summarize),/nichts/);
  await assert.rejects(rewindConversation(messages,3,"summarize-from",async()=>""),/unverändert/);
  const {store,data}=memoryStore(), session=new SessionController("/p","m",messages,{store});session.rename("Original");const originalId=session.id, checkpoint=session.checkpoint();session.update(restored.messages);session.save();assert.notEqual(checkpoint,originalId);assert.deepEqual(data.get(checkpoint!)?.messages,messages);assert.deepEqual(data.get(originalId)?.messages,restored.messages);
 });

 test("aborting a live provider stream consumes the rejected reader cancellation", async () => {
  const originalFetch = globalThis.fetch, controller = new AbortController();
  globalThis.fetch = async () => new Response(new ReadableStream({start(c) {controller.signal.addEventListener("abort",()=>c.error(new DOMException("aborted","AbortError")),{once:true});setTimeout(()=>controller.abort(),10);}}));
  try {
    const result=await runAgent([{role:"user",content:"cancel"}],{apiKey:"fixture",model:"gpt-4.1",provider:"openai",baseUrl:"http://127.0.0.1",maxTokens:10,temperature:0},"/tmp",{signal:controller.signal});
    assert.equal(result.aborted,true);
    await new Promise(resolve=>setTimeout(resolve,20));
  } finally {globalThis.fetch=originalFetch;}
 });
