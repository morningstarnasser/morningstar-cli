import { closeSync, constants, fstatSync, mkdirSync, openSync, readSync, writeFileSync, lstatSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ImageAttachment, Message } from "../types.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGES = 20;
const imageExtension = /\.(png|jpe?g|webp|gif)$/i;
const marker = /\[Image #(\d+)\]/g;

function readImage(path: string): { bytes: Buffer; mimeType: ImageAttachment["mimeType"]; sha256: string } {
  // O_NOFOLLOW is not implemented on Windows. Verify the path and descriptor
  // identity as well, retaining O_NOFOLLOW on platforms that support it.
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("Bild muss eine reguläre Datei sein, kein Symlink.");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let bytes: Buffer;
  try {
    const stat = fstatSync(fd);
    const after = lstatSync(path);
    if (after.isSymbolicLink() || before.dev !== stat.dev || before.ino !== stat.ino || after.dev !== stat.dev || after.ino !== stat.ino) throw new Error("Bilddatei wurde beim Öffnen verändert.");
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new Error("Bild muss eine reguläre Datei mit höchstens 5 MB sein.");
    const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_IMAGE_BYTES + 1));
    let size = 0, count = 0;
    while (size < buffer.length && (count = readSync(fd, buffer, size, buffer.length - size, null)) > 0) size += count;
    bytes = buffer.subarray(0, size);
    if (bytes.length > stat.size || bytes.length > MAX_IMAGE_BYTES) throw new Error("Bild ist grösser als 5 MB.");
  } finally { closeSync(fd); }
  const mimeType = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()) ? "image/gif"
    : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
  if (!mimeType) throw new Error("Kein unterstütztes Bild: PNG, JPEG, GIF oder WebP verwenden.");
  return { bytes, mimeType, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Snapshot the explicitly dropped file, so a rename or /resume cannot change its content. */
export function attachImage(path: string, id: number, cache = join(homedir(), ".morningstar", "attachments")): ImageAttachment {
  const image = readImage(path);
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  const directory = lstatSync(cache);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Bildspeicher darf kein Symlink sein.");
  chmodSync(cache, 0o700);
  const target = join(cache, `${image.sha256}.${image.mimeType.split("/")[1]}`);
  try { writeFileSync(target, image.bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const result: ImageAttachment = { id, path: target, name: basename(path), mimeType: image.mimeType, sha256: image.sha256 };
  imageData(result); // Existing snapshots must match too (including symlink protection).
  return result;
}

export function isImageAttachment(image: unknown): image is ImageAttachment {
  if (!image || typeof image !== "object") return false;
  const i = image as ImageAttachment;
  return Number.isSafeInteger(i.id) && i.id > 0 && typeof i.path === "string" && typeof i.name === "string" && /^(image\/(png|jpeg|gif|webp))$/.test(i.mimeType) && typeof i.sha256 === "string" && /^[a-f0-9]{64}$/.test(i.sha256);
}

export function imageData(image: ImageAttachment): string {
  if (!isImageAttachment(image)) throw new Error("Ungültiger Bild-Anhang. Bitte erneut anhängen.");
  const data = readImage(image.path);
  if (data.sha256 !== image.sha256 || data.mimeType !== image.mimeType) throw new Error(`Bild #${image.id} wurde verändert. Bitte erneut anhängen.`);
  return data.bytes.toString("base64");
}

/** Validate all retained attachments before any provider request. */
export function conversationImages(messages: readonly Message[]): ImageAttachment[] {
  const images = messages.filter(m => m.role === "user").flatMap(m => m.images ?? []);
  if (!images.every(isImageAttachment)) throw new Error("Ungültige Bild-Anhänge. Bitte erneut anhängen.");
  const unique = [...new Map(images.map(i => [`${i.id}:${i.sha256}`, i])).values()];
  if (images.length > MAX_IMAGES) throw new Error("Höchstens 20 Bilder im aktiven Kontext. Mit /new ein neues Gespräch beginnen.");
  let bytes = 0;
  for (const image of images) bytes += Buffer.byteLength(imageData(image), "base64");
  if (bytes > MAX_TOTAL_BYTES) throw new Error("Bilder im aktiven Kontext überschreiten zusammen 20 MB. Mit /new ein neues Gespräch beginnen.");
  return unique;
}

/** Shell-style quoting only; never executes, expands variables, globs or substitutions. */
export function droppedPaths(text: string, cwd: string): string[] {
  const clean = text.replace(/\x1b\[20[01]~/g, "").trim();
  function localPath(value: string) {
    try {
      if (value.startsWith("file://")) return fileURLToPath(value);
      if (value.startsWith("~/")) return join(homedir(), value.slice(2));
      return resolve(cwd, value);
    } catch { return ""; }
  }
  // Finder may emit a whole unescaped path containing spaces.
  if (imageExtension.test(clean)) {
    const direct = localPath(clean);
    try { const fd = openSync(direct, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); closeSync(fd); return [direct]; } catch { /* try shell quoting */ }
  }
  const words: string[] = []; let word = "", quote = "", escaped = false;
  for (let index = 0; index < clean.length; index++) {
    const c = clean[index];
    if (escaped) { word += c; escaped = false; }
    else if (c === "\\" && quote !== "'" && !(process.platform === "win32" && /^[A-Za-z]:(?:[\\/]|$)/.test(word) && !/\s/.test(clean[index + 1] ?? ""))) escaped = true;
    else if (quote) { if (c === quote) quote = ""; else word += c; }
    else if (c === "'" || c === '"') quote = c;
    else if (/\s/.test(c)) { if (word) words.push(word); word = ""; }
    else word += c;
  }
  if (quote || escaped) return [];
  if (word) words.push(word);
  // Only a paste/drop consisting entirely of local image paths is converted.
  if (!words.length || !words.every(w => imageExtension.test(w) && /^(\/|~\/|\.\.?\/|file:\/\/|[A-Za-z]:[\\/])/.test(w))) return [];
  return words.map(localPath);
}

export class ImageDrafts {
  private images = new Map<number, ImageAttachment>();
  private next = 1;
  constructor(seed: ImageAttachment[] = [], private cache?: string) { this.seed(seed); }
  seed(images: ImageAttachment[]) { for (const image of images) { this.images.set(image.id, image); this.next = Math.max(this.next, image.id + 1); } }
  paste(text: string, cwd: string): string {
    const paths = droppedPaths(text, cwd);
    if (!paths.length) return text;
    if (paths.length > MAX_IMAGES) throw new Error("Höchstens 20 Bilder gleichzeitig anhängen.");
    const added = paths.map((path, i) => attachImage(path, this.next + i, this.cache));
    this.seed(added);
    return added.map(image => `[Image #${image.id}]`).join(" ") + " ";
  }
  forText(text: string): ImageAttachment[] {
    return [...new Set([...text.matchAll(marker)].map(m => Number(m[1])))].flatMap(id => {
      const image = this.images.get(id);
      if (!image) throw new Error(`Bild #${id} ist nicht angehängt. Bitte die Datei erneut hineinziehen oder den Platzhalter entfernen.`);
      return [image];
    });
  }
}
