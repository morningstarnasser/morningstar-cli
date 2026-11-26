import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { DocumentLinks } from "../src/runtime/document-preview.js";
import { TerminalWorkspace, type WorkspaceData } from "../src/runtime/terminal-workspace.js";
import { TerminalViewport } from "../src/runtime/terminal-viewport.js";

async function fixture(t: any) {
  const cwd = await mkdtemp(join(tmpdir(), "ms-sidebar-")); t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, "Anleitung.md"), "# Anleitung\n\nSo funktioniert die Vorschau.\n\n[Weiter](next.md)\n\n" + Array.from({ length: 80 }, (_, i) => `Zeile ${i}`).join("\n"));
  await writeFile(join(cwd, "next.md"), "# Zweite Seite\nErgebnis 4817");
  const links = new DocumentLinks(); links.register("Vault-Anleitung", join(cwd, "Anleitung.md"));
  const resumed: string[] = [];
  const data: WorkspaceData = { scope: "test", cwd, name: "UI-Nachweis", model: "test-model", status: "liest Dateien", busy: true, blocked: false, conversation: "Letzte Nachricht", agents: [{ id: "worker", name: "Coder", status: "running", detail: "Prüft Testfälle" }], sessions: () => [{ id: "previous", name: "Vorherige Sitzung", messageCount: 12, savedAt: "2026-11-26" }], resume: id => { resumed.push(id); } };
  const workspace = new TerminalWorkspace(links, () => data, () => {});
  return { cwd, links, data, workspace, resumed };
}
const text = (w: TerminalWorkspace, width = 120, height = 30) => stripVTControlCharacters(w.frame(width, height).join("\n"));

test("sidebar opens documents, follows nested links and preserves preview across narrow and wide layouts", async t => {
  const f = await fixture(t); f.workspace.open();
  assert.match(text(f.workspace), /Vault-Anleitung/);
  await f.workspace.input("\r"); assert.match(text(f.workspace), /So funktioniert/);
  assert.ok(f.links.list().some(link => link.label === "Weiter"));
  for (const width of [120, 88, 60, 40, 30, 20]) {
    const rows = f.workspace.frame(width, 24); assert.equal(rows.length, 24);
    for (const row of rows) assert.ok(stringWidth(row) <= width, `${width}: ${stripVTControlCharacters(row)}`);
  }
  // Clicking on the linked document body opens it, not the selected list row.
  const rows = f.workspace.frame(120, 30), row = rows.findIndex(value => stripVTControlCharacters(value).includes("Weiter ["));
  const raw = stripVTControlCharacters(rows[row]), x = raw.indexOf("Weiter [") + 2;
  await f.workspace.click(x, row + 1); assert.match(text(f.workspace), /Ergebnis 4817/);
});
test("agent state updates live; sessions cannot switch during active work or a pending dialog", async t => {
  const f = await fixture(t); f.workspace.open(); await f.workspace.input("2");
  assert.match(text(f.workspace), /Coder/); assert.match(text(f.workspace), /Prüft Testfälle/);
  f.data.agents[0].status = "completed"; f.data.agents[0].detail = "Ergebnis übergeben";
  assert.match(text(f.workspace), /Ergebnis übergeben/);
  await f.workspace.input("3"); text(f.workspace); await f.workspace.input("\r"); await f.workspace.input("r");
  assert.deepEqual(f.resumed, []); assert.match(text(f.workspace), /Sitzungswechsel erst/);
  f.data.busy = false; f.data.blocked = true; await f.workspace.input("r"); assert.deepEqual(f.resumed, []);
  f.data.blocked = false; await f.workspace.input("r"); assert.deepEqual(f.resumed, ["previous"]); assert.equal(f.workspace.active, false);
});
test("a static transcript link opens the file; resize and background updates preserve the preview; closing restores live output", async t => {
  const f = await fixture(t); let output = "";
  const view = new TerminalViewport({ columns: 120, rows: 30, workspace: f.workspace, links: f.links, write: s => { output += s; } });
  t.after(() => view.dispose());
  view.feed(`Siehe ${f.links.get("1")!.marker}\r\n> vorhandener Entwurf`); await view.flush();
  await view.pointer("down", 10, 1); await view.pointer("up", 10, 1);
  assert.equal(f.workspace.active, true);
  for (let i = 0; i < 100 && !text(f.workspace).includes("So funktioniert"); i++) await new Promise(resolve => setTimeout(resolve, 5));
  view.paint(); assert.match(stripVTControlCharacters(output), /So funktioniert/);
  view.feed("\r\nRESULT_WHILE_READING"); await view.flush(); view.resize(60, 24);
  assert.equal(f.workspace.active, true); assert.match(text(f.workspace, 60, 24), /So funktioniert/);
  await view.leave(); assert.equal(f.workspace.active, false); assert.match(stripVTControlCharacters(output), /RESULT_WHILE_READING/);
});
test("missing files show an error rather than a stale document; scrolling reaches the end", async t => {
  const f = await fixture(t); await f.workspace.openDocument(join(f.cwd, "Anleitung.md")); text(f.workspace);
  f.workspace.scroll(1000); assert.match(text(f.workspace), /Zeile 79/);
  await f.workspace.openDocument(join(f.cwd, "missing.md"));
  assert.match(text(f.workspace), /Vorschau nicht verfügbar/); assert.doesNotMatch(text(f.workspace), /Zeile 79/);
});

test("coalesced Enter and R are handled as two keys when resuming a session", async t => {
  const f = await fixture(t); f.data.busy = false; f.workspace.open();
  await f.workspace.input("3"); text(f.workspace);
  await f.workspace.input("\rr");
  assert.deepEqual(f.resumed, ["previous"]); assert.equal(f.workspace.active, false);
});
