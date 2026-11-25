import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export interface ImageBackend { name: string; command: string; args: string[]; timeoutMs: number }
export function loadImageBackend(path = join(homedir(), ".morningstar", "image-backend.json")): ImageBackend | undefined {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw new Error("Ungültige Bild-Backend-Konfiguration.");
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 120 || typeof value.command !== "string" || !isAbsolute(value.command)
    || !Array.isArray(value.args) || value.args.length > 30 || value.args.some((a: unknown) => typeof a !== "string" || a.includes("\0"))
    || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1000 || value.timeoutMs > 1800000) throw new Error("Ungültige Bild-Backend-Konfiguration.");
  return value;
}

/** Only an explicitly configured global backend is executable. Requests use stdin, never a shell. */
export async function runImageBackend(backend: ImageBackend, prompt: string, options: Record<string, unknown>, output: string) {
  const result = await new Promise<string>((resolve, reject) => {
    const child = spawn(backend.command, backend.args, { shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const chunks: Buffer[] = []; let bytes = 0, settled = false;
    const finish = (error?: Error, value = "") => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) { child.kill(); reject(error); } else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("Bildgenerierung hat das Zeitlimit überschritten.")), backend.timeoutMs);
    child.on("error", () => finish(new Error("Bild-Backend konnte nicht gestartet werden. Konfiguration prüfen.")));
    child.stdin.on("error", () => {});
    child.stderr.resume(); // Backend diagnostics belong in its private log, never in the transcript.
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 24 * 1024 * 1024) finish(new Error("Bild-Backend-Antwort ist zu gross.")); else chunks.push(chunk);
    });
    child.on("close", code => finish(code === 0 ? undefined : new Error("Lokale Bildgenerierung fehlgeschlagen. Privates Backend-Log prüfen."), Buffer.concat(chunks).toString("utf8")));
    child.stdin.end(JSON.stringify({ version: 1, prompt, options }));
  });
  let data: { image?: unknown; seed?: unknown; steps?: unknown; duration?: unknown };
  try { data = JSON.parse(result); } catch { throw new Error("Bild-Backend hat keine gültige JSON-Antwort geliefert."); }
  if (typeof data.image !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.image)) throw new Error("Bild-Backend hat kein PNG geliefert.");
  const png = Buffer.from(data.image, "base64");
  if (png.length < 45 || png.length > 16 * 1024 * 1024 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || png.subarray(12, 16).toString() !== "IHDR") throw new Error("Ungültiges PNG vom Bild-Backend.");
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || !Number.isSafeInteger(data.seed) || Number(data.seed) < 0 || !Number.isInteger(data.steps) || Number(data.steps) < 1 || !Number.isFinite(data.duration) || Number(data.duration) < 0) throw new Error("Ungültige Bild-Metadaten.");
  writeFileSync(output, png, { flag: "wx" });
  return { path: output, model: backend.name, resolution: `${width}x${height}`, seed: Number(data.seed), steps: Number(data.steps), duration: Number(data.duration) };
}
