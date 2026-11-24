import { toolEnvironment, vendorCommand } from "./runtime/platform-process.js";
// Read-only Superbrain access. QMD executes locally without a shell.
import { execFile, execFileSync } from "node:child_process";

const COLLECTION = "obsidian";

export type VaultExec = (args: string[]) => string;
export type AsyncVaultExec = (args: string[], signal?: AbortSignal) => Promise<string>;
const realExec: VaultExec = (args) => {
  const env = toolEnvironment(), command = vendorCommand("qmd", args, { env });
  return execFileSync(command.file, command.args, { encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024, env });
};
export const executeQmd: AsyncVaultExec = (args, signal) => new Promise((resolve, reject) => {
  const env = toolEnvironment(), command = vendorCommand("qmd", args, { env });
  execFile(command.file, command.args, { encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024,
    env, signal }, (error, stdout) => error ? reject(error) : resolve(stdout));
});

/** Exclude private records before their snippets reach a model or diagnostic. */
export function publicVaultPath(input: string): string | null {
  let path: string;
  try { path = decodeURIComponent(input); } catch { return null; }
  if (path.startsWith("qmd://")) {
    if (!path.startsWith(`qmd://${COLLECTION}/`)) return null;
    path = path.slice(`qmd://${COLLECTION}/`.length);
  }
  if (!path || path.length > 500 || /[\\\s?#%\x00-\x1f]/.test(path) || path.startsWith("/")) return null;
  const segments = path.split("/");
  if (segments.some((s) => !s || s.startsWith(".") || /^(credentials?|secrets?|private|session[-_]?logs?|sessions?|tokens?|passwords?)$/i.test(s))) return null;
  if (!path.endsWith(".md")) return null;
  return `qmd://${COLLECTION}/${path}`;
}

export function buildVaultArgs(sub: string, arg: string): string[] | null {
  if (sub === "search" || sub === "vsearch") {
    const query = arg.trim().slice(0, 500);
    if (!query || query.startsWith("-")) return null;
    return [sub, query, "-c", COLLECTION, "--json", "-n", "12"];
  }
  if (sub === "get") {
    const [raw, lineRaw] = arg.trim().split(/\s+/);
    const uri = publicVaultPath(raw ?? "");
    const line = lineRaw === undefined ? 1 : Number(lineRaw);
    return uri && Number.isSafeInteger(line) && line > 0 ? ["get", `${uri}:${line}`, "-l", "80"] : null;
  }
  if (sub === "status") return ["collection", "list"];
  return null;
}

export interface VaultHit { file: string; title: string; snippet: string }
export function parseVaultHits(raw: string): VaultHit[] {
  if (!raw.trim()) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("Invalid QMD response");
  return data.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const hit = item as Record<string, unknown>;
    const file = typeof hit.file === "string" ? publicVaultPath(hit.file) : null;
    if (!file) return [];
    return [{ file, title: typeof hit.title === "string" ? hit.title.slice(0, 200) : file,
      snippet: typeof hit.snippet === "string" ? hit.snippet.slice(0, 900) : "" }];
  });
}
function format(args: string[], raw: string): string {
  if (args[0] === "search" || args[0] === "vsearch") {
    const hits = parseVaultHits(raw);
    return hits.length ? hits.map((h) => `${h.title}\n${h.file}\n${h.snippet}`).join("\n\n").slice(0, 6000) : "Nichts im öffentlichen Superbrain gefunden.";
  }
  return raw.trim().slice(0, 10000) || "Nichts im Vault gefunden.";
}
function commandArgs(command: string): string[] | null {
  const [sub, ...rest] = command.trim().split(/\s+/);
  return ["search", "vsearch", "get", "status"].includes(sub?.toLowerCase())
    ? buildVaultArgs(sub.toLowerCase(), rest.join(" ")) : buildVaultArgs("search", command);
}
const INVALID = "Vault-Fehler: Ungültiger Befehl oder privater Pfad. Nutzung: search <query> · vsearch <query> · get <pfad> [startzeile] · status";
const UNAVAILABLE = "Vault-Fehler: QMD nicht verfügbar, Zeitlimit erreicht oder Antwort ungültig. Keine Ergebnisse geladen.";
export function runVaultCommand(command: string, exec: VaultExec = realExec): string {
  const args = commandArgs(command);
  if (!args) return INVALID;
  try { return format(args, exec(args)); } catch { return UNAVAILABLE; }
}
export async function runVaultCommandAsync(command: string, signal?: AbortSignal, exec: AsyncVaultExec = executeQmd): Promise<string> {
  const args = commandArgs(command);
  if (!args) return INVALID;
  try { return format(args, await exec(args, signal)); }
  catch (error) { if (signal?.aborted) throw error; return UNAVAILABLE; }
}
