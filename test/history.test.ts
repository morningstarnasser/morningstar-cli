import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Message } from "../src/types.js";

// os.homedir() uses HOME on POSIX and USERPROFILE on Windows. A scratch directory
// keeps these tests away from the real ~/.morningstar/history. node:test runs
// each file in its own process, so the override cannot leak into other suites.
const historyTestHome = mkdtempSync(join(tmpdir(), "morningstar-history-"));
const ORIGINAL_HOME = process.env.HOME;
process.env.HOME = historyTestHome;
const originalProfile = process.env.USERPROFILE;
process.env.USERPROFILE = historyTestHome;

type HistoryModule = typeof import("../src/history.js");
let history: HistoryModule;

before(async () => {
  history = await import("../src/history.js");
});

after(() => {
  if (originalProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalProfile;
  if (ORIGINAL_HOME === undefined) delete process.env.HOME;
  else process.env.HOME = ORIGINAL_HOME;
  rmSync(historyTestHome, { recursive: true, force: true });
});

const messages = (text: string): Message[] => [{ role: "user", content: text }];

const save = (name: string, existingId?: string) =>
  history.saveConversation(name, messages(name), "test-model", "proj", existingId);

test("a saved session loads by its id", () => {
  const saved = save("Erste Session");
  const loaded = history.loadConversation(saved.id);
  assert.ok(loaded);
  assert.equal(loaded.name, "Erste Session");
  assert.equal(loaded.messages[0].content, "Erste Session");
});

test("a saved session loads by its name", () => {
  // Regression: /rename saved under a name, but /history load only accepted
  // the id, so `/history load allgemein` reported "nicht gefunden".
  save("allgemein");
  const loaded = history.loadConversation("allgemein");
  assert.ok(loaded, "name lookup must work");
  assert.equal(loaded.name, "allgemein");
});

test("name lookup ignores case and surrounding whitespace", () => {
  save("Hydra Debug");
  assert.ok(history.loadConversation("hydra debug"));
  assert.ok(history.loadConversation("  Hydra Debug  "));
});

test("a unique id prefix is enough", () => {
  const saved = save("Prefix Test");
  // Ids begin with a base36 timestamp, so sessions saved in the same run share
  // a long common prefix. Compute the shortest one that is actually unique.
  const others = history.listConversations().filter((conv) => conv.id !== saved.id);
  let length = 1;
  while (
    length < saved.id.length
    && others.some((conv) => conv.id.startsWith(saved.id.slice(0, length)))
  ) {
    length += 1;
  }
  const prefix = saved.id.slice(0, length);
  const loaded = history.loadConversation(prefix);
  assert.ok(loaded, `prefix "${prefix}" should resolve`);
  assert.equal(loaded.id, saved.id);
});

test("an ambiguous id prefix resolves to nothing rather than guessing", () => {
  const first = save("Ambig A");
  const second = save("Ambig B");
  // Sessions saved milliseconds apart share their leading timestamp characters.
  let shared = "";
  for (let index = 0; index < Math.min(first.id.length, second.id.length); index += 1) {
    if (first.id[index] !== second.id[index]) break;
    shared += first.id[index];
  }
  assert.ok(shared.length > 0, "ids share a timestamp prefix");
  assert.equal(history.resolveConversationId(shared), null);
});

test("a unique partial name is enough", () => {
  save("Kursbuch Prototyp Analyse");
  const loaded = history.loadConversation("Prototyp Analyse");
  assert.ok(loaded);
  assert.equal(loaded.name, "Kursbuch Prototyp Analyse");
});

test("an ambiguous partial name resolves to nothing rather than guessing", () => {
  save("Bericht Montag");
  save("Bericht Dienstag");
  assert.equal(history.resolveConversationId("Bericht"), null);
  assert.equal(history.loadConversation("Bericht"), null);
});

test("duplicate names resolve to the newest session", async () => {
  const older = save("Doppelt");
  // savedAt has millisecond resolution; make the ordering unambiguous.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const newer = save("Doppelt");
  assert.notEqual(older.id, newer.id);
  assert.equal(history.resolveConversationId("Doppelt"), newer.id);
});

test("an unknown reference resolves to nothing", () => {
  assert.equal(history.resolveConversationId("gibt-es-nicht"), null);
  assert.equal(history.loadConversation("gibt-es-nicht"), null);
  assert.equal(history.resolveConversationId(""), null);
  assert.equal(history.resolveConversationId("   "), null);
});

test("path traversal cannot read outside the history directory", () => {
  const secret = join(historyTestHome, "secret.json");
  writeFileSync(secret, JSON.stringify({ id: "x", name: "secret", messages: [] }), "utf-8");
  for (const attack of ["../secret", "../../etc/passwd", "/etc/passwd", "..%2Fsecret"]) {
    assert.equal(history.loadConversation(attack), null, `${attack} must not resolve`);
  }
  assert.ok(existsSync(secret), "the file outside the history dir is untouched");
});

test("path traversal cannot delete outside the history directory", () => {
  const victim = join(historyTestHome, "victim.json");
  writeFileSync(victim, "{}", "utf-8");
  assert.equal(history.deleteConversation("../victim"), false);
  assert.ok(existsSync(victim), "the file outside the history dir survives");
});

test("saving with an existing id overwrites instead of duplicating", () => {
  const before = history.listConversations().length;
  const first = save("Umbenennen");
  const renamed = save("Neuer Name", first.id);
  assert.equal(renamed.id, first.id, "the id is kept");
  assert.equal(history.listConversations().length, before + 1, "no second copy");
  const loaded = history.loadConversation(first.id);
  assert.ok(loaded);
  assert.equal(loaded.name, "Neuer Name");
  assert.equal(history.resolveConversationId("Umbenennen"), null, "the old name is gone");
});

test("an unusable existing id falls back to a fresh one", () => {
  const saved = save("Fallback", "../evil");
  assert.notEqual(saved.id, "../evil");
  assert.ok(history.loadConversation(saved.id));
});

test("delete accepts a name and removes exactly that session", () => {
  save("Zu Loeschen");
  assert.equal(history.deleteConversation("Zu Loeschen"), true);
  assert.equal(history.loadConversation("Zu Loeschen"), null);
  assert.equal(history.deleteConversation("Zu Loeschen"), false, "already gone");
});

test("listConversations returns newest first", () => {
  const list = history.listConversations();
  const sorted = [...list].sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  assert.deepEqual(list.map((conv) => conv.id), sorted.map((conv) => conv.id));
});
test("session writes are private and a malformed sibling does not hide valid sessions", () => {
  const saved = save("Private Session");
  const directory = join(historyTestHome, ".morningstar", "history");
  if (process.platform !== "win32") assert.equal(statSync(join(directory, `${saved.id}.json`)).mode & 0o777, 0o600);
  if (process.platform !== "win32") assert.equal(statSync(directory).mode & 0o777, 0o700);
  writeFileSync(join(directory, "broken.json"), JSON.stringify({ id: "broken", name: "bad" }));
  assert.ok(history.listConversations().some((item) => item.id === saved.id));
});
test("session list skips symlinks and continue is project scoped", () => {
  const saved = history.saveConversation("project a", messages("a"), "fake", "/project/a");
  history.saveConversation("project b", messages("b"), "fake", "/project/b");
  const directory = join(historyTestHome, ".morningstar", "history");
  symlinkSync(join(directory, `${saved.id}.json`), join(directory, "linked.json"));
  assert.equal(history.loadConversation("linked"), null);
  assert.equal(history.getLastConversation("/project/a")?.id, saved.id);
  assert.equal(history.getLastConversation("/missing"), null);
});
test("legacy autosave names with underscores remain readable", () => {
  history.autoSave(messages("autosave"), "some_project", "fake");
  assert.equal(history.getLastAutoSave("some_project")?.messages[0].content, "autosave");
});
