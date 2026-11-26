import { Lexer, type Token, type Tokens } from "marked";
import stringWidth from "string-width";
import { Chalk } from "chalk";
import { getTheme } from "../theme.js";
import { displayText } from "./work-log.js";
import { DocumentLinks, documentLinkIdentity, readDocument, relativeDocumentHref, type DocumentPreview } from "./document-preview.js";

export interface WorkspaceData {
  scope: string; cwd: string; name: string; model: string; status: string; busy: boolean; blocked: boolean;
  conversation: string;
  agents: { id: string; name: string; status: string; detail: string }[];
  sessions: () => { id: string; name: string; savedAt: string; messageCount: number }[];
  resume: (id: string) => void;
}
interface Row { text: string; tone?: "primary" | "dim" | "info"; bold?: boolean }
interface Entry { id: string; title: string; detail: string }
const tabs = ["Dokumente", "Agenten", "Sitzungen"];
const c = new Chalk({ level: 3 });
const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function fitCells(text: string, width: number): string {
  let result = "", used = 0;
  for (const { segment } of segments.segment(displayText(text).replace(/[\r\n\t]/g, " "))) {
    const size = stringWidth(segment); if (used + size > width) break;
    result += segment; used += size;
  }
  return result;
}
function wrap(text: string, width: number): string[] {
  const rows: string[] = [];
  for (const paragraph of text.replace(/\t/g, "  ").split("\n")) {
    let remaining = paragraph;
    while (stringWidth(remaining) > width) {
      let part = fitCells(remaining, width);
      const space = part.lastIndexOf(" ");
      if (space > width * .45) part = part.slice(0, space);
      rows.push(part); remaining = remaining.slice(part.length).replace(/^ +/, "");
    }
    rows.push(remaining);
  }
  return rows;
}

/** A read-only navigator layered over the live terminal, not a second agent session. */
export class TerminalWorkspace {
  active = false;
  private tab = 0;
  private selected = 0;
  private selectedId = "";
  private offset = 0;
  private listOffset = 0;
  private focus: "list" | "document" = "list";
  private document: DocumentPreview | undefined;
  private error = "";
  private loading = false;
  private generation = 0;
  private controller?: AbortController;
  private scope = "";
  private body: Row[] = [];
  private documentRows?: Row[];
  private wrappedSource?: Row[];
  private wrappedWidth = 0;
  private entries: Entry[] = [];
  private sessionList: ReturnType<WorkspaceData["sessions"]> = [];
  private width = 80;
  private height = 24;
  private sidebar = 0;
  private visibleBody: Row[] = [];
  private navTop = 4;
  private onChange: () => void;
  constructor(readonly links: DocumentLinks, private data: () => WorkspaceData | undefined, changed: () => void) { this.onChange = changed; }
  private syncScope() {
    const scope = this.data()?.scope || "";
    if (scope !== this.scope) {
      this.scope = scope; this.controller?.abort(); this.generation++;
      this.document = undefined; this.documentRows = undefined;
      this.tab = 0; this.selected = 0; this.selectedId = ""; this.offset = 0; this.listOffset = 0;
      this.focus = "list"; this.error = ""; this.loading = false;
    }
  }
  open() {
    this.syncScope();
    this.active = true; this.error = "";
    try { this.sessionList = this.data()?.sessions().slice(0, 100) ?? []; }
    catch { this.sessionList = []; this.error = "Sitzungen konnten nicht gelesen werden."; }
    this.onChange();
  }
  close() { this.active = false; this.generation++; this.controller?.abort(); this.loading = false; }
  async openDocument(href: string) {
    if (!this.active) this.open();
    this.controller?.abort(); this.controller = new AbortController();
    const request = ++this.generation;
    this.tab = 0; this.focus = "document"; this.loading = true; this.error = ""; this.offset = 0;
    this.onChange();
    try {
      const data = this.data(); if (!data) throw new Error("Sitzung noch nicht bereit.");
      const doc = await readDocument(href, data.cwd, undefined, this.controller.signal);
      if (request !== this.generation || !this.active) return;
      this.document = doc; this.documentRows = undefined;
      const link = this.links.list().filter(link => link.href === href).at(-1) ?? this.links.register(doc.title, href); this.selectedId = link?.id ?? "";
      this.offset = Math.max(0, doc.line - 1);
    } catch (error) { if (request === this.generation) this.error = displayText((error as Error).message); }
    finally { if (request === this.generation) { this.loading = false; this.onChange(); } }
  }
  private changeTab(tab: number) {
    this.controller?.abort(); this.generation++; this.loading = false; this.error = "";
    this.tab = Math.max(0, Math.min(2, tab)); this.selected = 0; this.selectedId = ""; this.offset = 0; this.listOffset = 0; this.focus = "list";
    this.onChange();
  }
  private async choose() {
    const entry = this.entries[this.selected]; if (!entry) return;
    this.selectedId = entry.id; this.offset = 0; this.focus = "document";
    if (this.tab === 0) { const link = this.links.get(entry.id); if (link) await this.openDocument(link.href); }
    this.onChange();
  }
  async input(input: string) {
    if (["1", "2", "3"].includes(input)) { this.changeTab(Number(input) - 1); return; }
    if (input === "\t" || input === "b" || input === "\x1b[Z") { this.focus = this.focus === "list" ? "document" : "list"; this.onChange(); return; }
    if (input === "r" && this.tab === 2 && this.selectedId) {
      const data = this.data();
      if (data?.busy || data?.blocked) this.error = "Sitzungswechsel erst nach dem laufenden Auftrag oder offenen Dialog möglich.";
      else try { data?.resume(this.selectedId); this.close(); } catch (error) { this.error = displayText((error as Error).message); }
      this.onChange(); return;
    }
    if (input === "\r" || input === "\n") { await this.choose(); return; }
    if (["\x1b[A", "\x1b[B"].includes(input)) {
      if (this.focus === "list") {
        this.selected = Math.max(0, Math.min(this.entries.length - 1, this.selected + (input.endsWith("A") ? -1 : 1)));
        this.selectedId = this.entries[this.selected]?.id ?? "";
      } else this.scroll(input.endsWith("A") ? -1 : 1);
    } else if (["\x1b[5~", "\x1b[6~"].includes(input)) this.scroll((input === "\x1b[5~" ? -1 : 1) * Math.max(1, this.height - 8));
    else if (["\x1b[H", "\x1b[1~", "\x1bOH"].includes(input)) this.offset = 0;
    else if (["\x1b[F", "\x1b[4~", "\x1bOF"].includes(input)) this.offset = Math.max(0, this.body.length - (this.height - 7));
    this.onChange();
  }
  scroll(amount: number, x = this.width) {
    if ((this.sidebar && x <= this.sidebar) || (!this.sidebar && this.focus === "list")) {
      this.selected = Math.max(0, Math.min(this.entries.length - 1, this.selected + amount));
      this.selectedId = this.entries[this.selected]?.id ?? "";
    } else this.offset = Math.max(0, Math.min(Math.max(0, this.body.length - (this.height - 7)), this.offset + amount));
    this.onChange();
  }
  async click(x: number, y: number) {
    if (y === 2) { const tab = Math.floor((x - 2) / (this.width < 44 ? 6 : 13)); if (tab >= 0 && tab < 3) this.changeTab(tab); return; }
    if (y === this.height) { this.close(); this.onChange(); return; }
    if ((this.sidebar && x <= this.sidebar) || (!this.sidebar && this.focus === "list")) {
      const n = this.listOffset + y - this.navTop;
      if (n >= 0 && n < this.entries.length && y < this.height - 2) { this.selected = n; await this.choose(); }
      return;
    }
    if (y >= 5 && y < this.height - 2) {
      const row = this.visibleBody[y - 5];
      if (!row) return;
      // Cell coordinates must be converted to JS offsets for CJK and emoji labels.
      const column = Math.max(0, x - (this.sidebar ? this.sidebar + 3 : 2));
      const offset = fitCells(row.text, column).length;
      const index = this.offset + y - 5, start = Math.max(0, index - 5);
      const before = this.body.slice(start, index).map(row => row.text + "\n").join("");
      const around = this.body.slice(start, index + 6).map(row => row.text).join("\n");
      const link = this.links.hit(around, before.length + offset);
      if (link) await this.openDocument(link.href);
    }
  }
  private markdownRows(text: string, path: string): Row[] {
    const inline = (tokens: Token[]): string => tokens.map(token => {
      if (token.type === "link") {
        const label = inline(token.tokens ?? []);
        return this.links.register(label, relativeDocumentHref(token.href, path))?.marker ?? `${label} (${token.href})`;
      }
      if (token.type === "image") return `[Bild: ${token.text}]`;
      if (token.type === "br") return "\n";
      return "tokens" in token && token.tokens ? inline(token.tokens) : "text" in token ? token.text : token.raw;
    }).join("");
    const block = (tokens: Token[]): Row[] => tokens.flatMap((token): Row[] => {
      if (token.type === "space" || token.type === "def") return [];
      if (token.type === "heading") return [{ text: inline(token.tokens ?? []), tone: "primary", bold: true }, { text: "" }];
      if (token.type === "code") return [{ text: token.lang || "Code", tone: "dim" }, ...String(token.text).split("\n").map(text => ({ text: `  ${text}`, tone: "info" as const })), { text: "" }];
      if (token.type === "blockquote") return block(token.tokens ?? []).map(row => ({ ...row, text: `│ ${row.text}` }));
      if (token.type === "list") return (token.items as Tokens.ListItem[]).flatMap((item, i) => [{ text: `${token.ordered ? `${Number(token.start) + i}.` : "•"} ${inline(Lexer.lexInline(item.text))}` }]);
      if (token.type === "table") return [{ text: (token.header as Tokens.TableCell[]).map(cell => inline(cell.tokens)).join(" · "), tone: "primary", bold: true }, ...(token.rows as Tokens.TableCell[][]).map(row => ({ text: row.map(cell => inline(cell.tokens)).join(" · ") })), { text: "" }];
      if (token.type === "hr") return [{ text: "" }];
      return [{ text: inline("tokens" in token && token.tokens ? token.tokens : Lexer.lexInline("text" in token ? token.text : token.raw)) }, { text: "" }];
    });
    return block(Lexer.lex(text, { gfm: true }));
  }
  frame(columns: number, rows: number): string[] {
    this.syncScope();
    this.width = columns; this.height = rows; this.sidebar = columns >= 88 ? Math.min(32, Math.floor(columns * .27)) : 0;
    const data = this.data(), theme = getTheme();
    const color = (tone: "primary" | "dim" | "info") => c.hex(theme[tone]);
    this.entries = this.tab === 0 ? [...new Map(this.links.list().map(link => [documentLinkIdentity(link.href), link])).values()].map(link => ({ id: link.id, title: link.label, detail: link.href }))
      : this.tab === 1 ? (data?.agents ?? []).map(agent => ({ id: agent.id, title: `${agent.status === "running" ? "●" : agent.status === "completed" ? "✓" : "○"} ${agent.name}`, detail: `${({ running: "Arbeitet", pending: "Wartet", completed: "Fertig", failed: "Fehler", cancelled: "Abgebrochen" } as Record<string, string>)[agent.status] || agent.status}\n\n${agent.detail}` }))
      : this.sessionList.map(session => ({ id: session.id, title: session.name, detail: `${session.messageCount} Nachrichten · ${session.savedAt.slice(0, 10)}\n\nR: Diese Sitzung fortsetzen.\nDie aktuelle Sitzung wird vorher gespeichert.` }));
    const stable = this.entries.findIndex(entry => entry.id === this.selectedId);
    this.selected = stable >= 0 ? stable : Math.max(0, Math.min(this.selected, this.entries.length - 1));
    const selected = this.entries[this.selected];
    let title = data?.name || "Aktuelle Sitzung", subtitle = data?.model || "", content: Row[];
    if (this.loading) { title = "Dokument öffnen"; content = [{ text: "Lade Vorschau …", tone: "dim" }]; }
    else if (this.error) { title = "Vorschau nicht verfügbar"; content = [{ text: this.error }, { text: "" }, { text: "Tab: zurück zur Auswahl · Esc: zum Chat", tone: "dim" }]; }
    else if (this.tab === 0 && this.document) {
      const doc = this.document; title = this.links.list().find(link => link.id === this.selectedId)?.label || doc.title; subtitle = doc.path;
      content = this.documentRows ??= doc.markdown && doc.line === 1 ? this.markdownRows(doc.text, doc.path) : doc.text.split("\n").map((text, index) => ({ text: `${String(index + 1).padStart(4)}  ${text}` }));
    } else if (this.tab !== 0 && selected) { title = selected.title; subtitle = tabs[this.tab]; content = selected.detail.split("\n").map(text => ({ text })); }
    else { content = [{ text: "Dein Arbeitsbereich", tone: "primary", bold: true }, { text: "" }, { text: "Links im Chat öffnen hier die Datei. Wähle links ein Dokument, einen Agenten oder eine gespeicherte Sitzung." }, { text: "" }, ...displayText(data?.conversation || "Noch keine Nachrichten in dieser Sitzung.").split("\n").map(text => ({ text }))]; }
    const bodyWidth = Math.max(8, columns - (this.sidebar ? this.sidebar + 3 : 2));
    if (this.wrappedSource !== content || this.wrappedWidth !== bodyWidth) {
      this.body = content.flatMap(row => wrap(displayText(row.text), bodyWidth).map(text => ({ ...row, text })));
      this.wrappedSource = content; this.wrappedWidth = bodyWidth;
    }
    const bodyHeight = Math.max(1, rows - 7);
    this.offset = Math.max(0, Math.min(this.offset, this.body.length - bodyHeight));
    this.visibleBody = this.body.slice(this.offset, this.offset + bodyHeight);
    const paint = (row: Row) => {
      let text = fitCells(row.text, bodyWidth);
      for (const link of this.links.list()) if (text.includes(link.marker)) text = text.replaceAll(link.marker, c.hex(theme.info).underline(link.marker));
      if (row.tone) text = color(row.tone)(text); if (row.bold) text = c.bold(text); return text;
    };
    const navWidth = this.sidebar || columns - 2;
    const listHeight = Math.max(1, rows - 6);
    this.listOffset = Math.max(0, Math.min(this.listOffset, this.selected));
    if (this.selected >= this.listOffset + listHeight) this.listOffset = this.selected - listHeight + 1;
    const nav = (n: number) => {
      const entry = this.entries[n];
      if (!entry) return n === 0 ? color("dim")(fitCells("  Noch keine Einträge", navWidth - 1)) : "";
      const label = fitCells(`${n === this.selected ? "›" : " "} ${displayText(entry.title)}`, navWidth - 1);
      return n === this.selected ? c.bgHex("#23363c").hex(theme.info)(label.padEnd(label.length + Math.max(0, navWidth - 1 - stringWidth(label)))) : color("dim")(label);
    };
    const pad = (text: string, width: number) => text + " ".repeat(Math.max(0, width - stringWidth(text)));
    const frame = Array.from({ length: rows }, () => "");
    frame[0] = ` ${c.bold.hex(theme.primary)("Morningstar")}${columns >= 32 ? color("dim")(" / Arbeitsbereich") : ""}`;
    frame[1] = " " + (columns < 44 ? ["Doc", "Ag", "Chat"] : tabs).map((tab, i) => (i === this.tab ? c.bold.hex(theme.info) : color("dim"))(`${i + 1} ${tab}`.padEnd(columns < 44 ? 6 : 13))).join("");
    if (!this.sidebar && this.focus === "list") {
      frame[2] = color("dim")(fitCells(" Enter öffnen · Tab Vorschau", columns));
      for (let i = 0; i < listHeight; i++) frame[i + 3] = ` ${nav(this.listOffset + i)}`;
    } else {
      const left = (row: number) => this.sidebar ? pad(row >= 3 ? nav(this.listOffset + row - 3) : color("dim")(` ${tabs[this.tab]}`), this.sidebar) + color("dim")("│ ") : " ";
      frame[2] = left(2) + c.bold.hex(theme.primary)(fitCells(title, bodyWidth));
      frame[3] = (this.sidebar ? left(3) : " ") + color("dim")(fitCells(subtitle, bodyWidth));
      for (let i = 0; i < bodyHeight; i++) frame[i + 4] = left(i + 4) + (this.visibleBody[i] ? paint(this.visibleBody[i]) : "");
    }
    frame[rows - 2] = ` ${color("dim")(fitCells(`${data?.busy ? "● " : "○ "}${data?.status || "Bereit"} · ${data?.agents.filter(a => a.status === "running").length ?? 0} Agenten aktiv`, columns - 2))}`;
    frame[rows - 1] = c.bgHex("#23363c").hex(theme.info)(pad(fitCells(` Esc Chat · Ctrl+B schliessen · Tab Fokus · ↑↓ ${this.focus === "list" ? "Auswahl" : "lesen"} · ${this.offset + 1}/${this.body.length}`, columns), columns));
    return frame;
  }
}
