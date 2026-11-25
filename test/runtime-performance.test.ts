import { pathToFileURL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createStreamRenderScheduler } from "../src/runtime/stream-render.js";
import { createRecallCache } from "../src/runtime/recall-cache.js";
import { discoverSkills } from "../src/skill-catalog.js";

function clock() {
  let id = 0; const pending = new Map<number, () => void>();
  return { pending, schedule: (fn: () => void) => { pending.set(++id, fn); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel: (handle: ReturnType<typeof setTimeout>) => { pending.delete(handle as unknown as number); },
    tick: () => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach((fn) => fn()); } };
}

test("stream renders the first delta immediately and preserves all text while coalescing a burst", () => {
  const time = clock(); let text = "", visible = ""; const frames: string[] = [];
  const display = createStreamRenderScheduler(() => { visible = text; frames.push(visible); }, 33, time.schedule, time.cancel);
  text += "first"; display.request(); assert.equal(visible, "first");
  for (let i = 0; i < 1000; i++) { text += "x"; display.request(); }
  assert.equal(time.pending.size, 1); assert.equal(frames.length, 1);
  time.tick(); assert.equal(visible, text); assert.equal(frames.length, 2);
});

test("flush shows the final state once; cancellation/new turn cannot resurrect stale output", () => {
  const time = clock(); let count = 0;
  const display = createStreamRenderScheduler(() => count++, 33, time.schedule, time.cancel);
  display.request(); display.request(); display.flush(); assert.equal(count, 2); time.tick(); assert.equal(count, 2);
  display.request(); display.reset(); time.tick(); assert.equal(count, 2);
  display.request(); assert.equal(count, 3); // new turn's first delta is immediate
});

const hits = (snippet = "public") => JSON.stringify([
  { file: "qmd://obsidian/workflows/example.md", title: "Example", snippet },
  { file: "qmd://obsidian/credentials/private.md", title: "secret", snippet: "PRIVATE_VALUE" },
]);

test("automatic recall caches only filtered public hits and expires promptly", async () => {
  let now = 0, calls = 0;
  const cached = createRecallCache(async () => { calls++; return hits(`version-${calls}`); }, () => now, 15, 2);
  const first = await cached(["search", "example"]); first[0].snippet = "caller mutation";
  assert.equal((await cached(["search", "example"]))[0].snippet, "version-1"); assert.equal(calls, 1);
  assert.equal(first.length, 1); assert(!JSON.stringify(first).includes("PRIVATE_VALUE"));
  now = 15; assert.equal((await cached(["search", "example"]))[0].snippet, "version-2");
  await cached(["search", "two"]); await cached(["search", "three"]); await cached(["search", "example"]);
  assert.equal(calls, 5); // capacity remains bounded; oldest query was evicted
});

test("recall cancellation and failures are never cached; aborted callers cannot consume a cache hit", async () => {
  let calls = 0;
  const cached = createRecallCache(async () => { if (++calls === 1) throw new Error("unavailable"); return hits(); });
  await assert.rejects(cached(["search", "x"])); await cached(["search", "x"]); assert.equal(calls, 2);
  const stopped = new AbortController(); stopped.abort(); await assert.rejects(cached(["search", "x"], stopped.signal));
  assert.equal(calls, 2);
  const cancel = new AbortController(); let reads = 0;
  const cancelledRead = createRecallCache(async () => { reads++; cancel.abort(); return hits(); });
  await assert.rejects(cancelledRead(["search", "x"], cancel.signal)); await cancelledRead(["search", "x"]);
  assert.equal(reads, 2);
});

test("cached project skill metadata stays within the requesting workspace", (t) => {
  const root = mkdtempSync(join(tmpdir(), "skill-cache-scope-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const a = join(root, "a"), b = join(root, "b"); mkdirSync(join(a, "skill"), { recursive: true }); mkdirSync(b);
  writeFileSync(join(a, "skill", "SKILL.md"), "# Project procedure");
  const roots = [{ path: a, label: "project", trusted: false }];
  assert.equal(discoverSkills(a, { roots }).skills.length, 1);
  assert.equal(discoverSkills(b, { roots }).skills.length, 0);
});

test("help and version complete without reading credentials or loading the terminal", (t) => {
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  const root = mkdtempSync(join(tmpdir(), "morningstar-startup-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const guard = join(root, "guard.mjs");
  writeFileSync(guard, `import fs from 'node:fs'; import {syncBuiltinESMExports,register} from 'node:module';
const read=fs.readFileSync;fs.readFileSync=function(path,...args){if(String(path).replaceAll(String.fromCharCode(92),'/').includes('/.morningstar/'))throw new Error('Unexpected credential/state read');return read.call(this,path,...args)};syncBuiltinESMExports();
register('data:text/javascript,'+encodeURIComponent(\`export async function resolve(specifier,context,next){if(['react','ink','shiki'].includes(specifier)||specifier.endsWith('/app.js'))throw new Error('Terminal eagerly loaded');return next(specifier,context)}\`));`);
  for (const flag of ["--version", "--help"]) {
    const output = execFileSync(process.execPath, ["--import", "tsx", "--import", pathToFileURL(guard).href, resolve("src/index.ts"), flag], { encoding: "utf8", timeout: 10000 });
    if (flag === "--version") assert.equal(output.trim(), version);
    else assert(output.includes("Usage:"));
  }
});
