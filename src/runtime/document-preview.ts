import { open, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { guardRead, resolveWithinWorkspace } from "../file-guards.js";
import { executeQmd, publicVaultPath } from "../vault.js";
import { displayText } from "./work-log.js";

export interface DocumentLink { id: string; label: string; href: string; marker: string }
export interface DocumentPreview { title: string; path: string; text: string; line: number; markdown: boolean }
const LIMIT = 512 * 1024;
const forbidden = /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.ssh|\.gnupg|credentials?(?:\.[^\\/]*)?|secrets?(?:\.[^\\/]*)?|id_(?:rsa|ed25519)|[^\\/]+\.(?:pem|key|p12|pfx))(?:[\\/]|$)/i;

export function localDocumentHref(href: string): boolean {
  const path = href.replace(/(?::\d+(?::\d+)?|#L\d+(?:C\d+)?)$/, "");
  return Boolean(href) && href.length <= 4096 && !/[\x00-\x1f\x7f-\x9f]/.test(href)
    && (!/^[a-z][\w+.-]*:/i.test(path) || /^(?:file:|qmd:\/\/obsidian\/|[a-z]:[\\/])/i.test(href))
    && !href.startsWith("#") && !/^(?:\\\\|\/\/)/.test(href);
}

/** Static terminal rows retain this small registry after React unmounts them. */
export class DocumentLinks {
  private next = 1;
  private links = new Map<string, DocumentLink>();
  register(label: string, href: string): DocumentLink | undefined {
    if (!localDocumentHref(href)) return;
    label = displayText(label).replace(/[\r\n\t]+/g, " ").trim().slice(0, 180) || basename(href);
    const existing = [...this.links.values()].find(link => link.href === href && link.label === label);
    if (existing) return existing;
    const id = String(this.next++), marker = `${label} [${id}]`;
    const link = { id, label, href, marker }; this.links.set(id, link);
    if (this.links.size > 1000) this.links.delete(this.links.keys().next().value!);
    return link;
  }
  get(id: string) { return this.links.get(id); }
  list() { return [...this.links.values()]; }
  clear() { this.links.clear(); }
  hit(text: string, offset: number): DocumentLink | undefined {
    for (const match of text.matchAll(/\[(\d+)\]/g)) {
      const link = this.get(match[1]); if (!link) continue;
      const start = match.index! - link.label.length - 1;
      if (start >= 0 && text.slice(start, match.index! + match[0].length) === link.marker
        && offset >= start && offset < match.index! + match[0].length) return link;
    }
    // Ink wraps Text with hard newlines and indentation; xterm also soft-wraps.
    // Match only the registered label+marker, including across those boundaries.
    for (const link of this.links.values()) {
      const escaped = [...link.marker].map(char => /\s/.test(char) ? "\\s+" : char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\n\\s*)?").join("");
      for (const match of text.matchAll(new RegExp(escaped, "g"))) {
        if (offset >= match.index! && offset < match.index! + match[0].length) return link;
      }
    }
  }
}

export async function readDocument(href: string, cwd: string, vault = process.env.MORNINGSTAR_VAULT_DIR || join(homedir(), "Documents", "obsidian-vault"), signal?: AbortSignal): Promise<DocumentPreview> {
  if (!localDocumentHref(href)) throw new Error("Dieser Link ist keine lokale Textdatei oder Vault-Notiz.");
  if (href.startsWith("qmd://")) {
    const uri = publicVaultPath(href);
    if (!uri) throw new Error("Dieser Vault-Pfad ist nicht für die Vorschau freigegeben.");
    const text = displayText(await executeQmd(["get", uri, "-l", "1000"], signal));
    return { title: basename(uri), path: uri, text: text.slice(0, LIMIT) + "\n\nQMD-Vorschau: maximal 1000 Zeilen.", line: 1, markdown: true };
  }
  let target = href.trim().replace(/^<|>$/g, ""), line = 1;
  const position = /(?::(\d+)(?::\d+)?|#L(\d+)(?:C\d+)?)$/.exec(target);
  if (position) { line = Math.max(1, Number(position[1] || position[2])); target = target.slice(0, position.index); }
  // Heading anchors are navigation hints; they never change the file boundary.
  if (!target.startsWith("file:")) target = target.split("#")[0];
  try { target = target.startsWith("file:") ? fileURLToPath(new URL(target)) : decodeURIComponent(target); }
  catch { throw new Error("Ungültiger Dateilink."); }
  if (target.startsWith("~/") || target.startsWith("~\\")) target = join(homedir(), target.slice(2));
  if (/^(?:\\\\|\/\/)/.test(target) || /[\x00-\x1f\x7f-\x9f]/.test(target)) throw new Error("Netzwerkpfade und Steuerzeichen sind nicht erlaubt.");
  target = isAbsolute(target) ? target : resolve(cwd, target);
  const roots = [cwd, vault];
  const checked = roots.map(root => resolveWithinWorkspace(target, root)).find(check => check.ok);
  if (!checked) throw new Error("Datei liegt ausserhalb von Projekt und Vault. Öffne das zugehörige Projekt oder setze MORNINGSTAR_VAULT_DIR.");
  if (forbidden.test(target) || forbidden.test(checked.resolved)) throw new Error("Zugangsdaten und Schlüssel werden in der Vorschau nicht geöffnet.");
  const info = await stat(checked.resolved);
  if (!info.isFile()) throw new Error("Die Vorschau unterstützt nur reguläre Textdateien.");
  if (info.size > LIMIT) throw new Error("Datei grösser als 512 KiB. Bitte einen kleineren Ausschnitt öffnen.");
  const handle = await open(checked.resolved, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.size > LIMIT) throw new Error("Datei kann nicht als begrenzte Textvorschau geöffnet werden.");
    const data = Buffer.alloc(Math.min(current.size + 1, LIMIT + 1));
    const { bytesRead } = await handle.read(data, 0, data.length, 0);
    const bytes = data.subarray(0, bytesRead), error = guardRead(bytesRead, bytes);
    if (error || bytesRead > LIMIT) throw new Error(error || "Datei ist für die Vorschau zu gross.");
    return { title: basename(checked.resolved), path: checked.resolved, text: displayText(bytes.toString("utf8")), line, markdown: /\.(?:md|markdown)$/i.test(checked.resolved) };
  } finally { await handle.close(); }
}

export function relativeDocumentHref(href: string, document: string): string {
  if (!localDocumentHref(href) || isAbsolute(href) || /^[a-z][\w+.-]*:/i.test(href) || href.startsWith("~/")) return href;
  if (document.startsWith("qmd://")) return new URL(href, document).href;
  return resolve(dirname(document), href);
}
