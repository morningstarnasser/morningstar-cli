import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ImageDrafts, attachImage, conversationImages, imageData, droppedPaths } from "../src/runtime/images.js";
import { serializeOpenAIMessages, serializeAnthropicMessages, serializeGeminiMessages } from "../src/providers.js";
import { codexCliStream } from "../src/providers/codex-cli.js";
import { claudeCliStream } from "../src/providers/claude-cli.js";
import { rewindConversation } from "../src/runtime/rewind.js";
import { classifyLocalInput } from "../src/input-routing.js";
import type { Message } from "../src/types.js";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fooAAAAASUVORK5CYII=", "base64");
function fixture(t: any) { const dir = mkdtempSync(join(tmpdir(), "morningstar-images-test-")); t.after(() => rmSync(dir, { recursive: true, force: true })); const path = join(dir, "image with spaces.png"); writeFileSync(path, png); return { dir, path, cache: join(dir, "cache") }; }

test("Finder paths: quoted, escaped, file URL, multiple and shell syntax stays literal", t => {
  const { dir, path } = fixture(t);
  for (const text of [path, `'${path}'`, `"${path}"`, path.replaceAll(" ", "\\ "), pathToFileURL(path).href]) assert.deepEqual(droppedPaths(text, dir), [path]);
  assert.deepEqual(droppedPaths(`'${path}' '${path}'`, dir), [path, path]);
  assert.deepEqual(droppedPaths(`explain '${path}'`, dir), []);
  assert.deepEqual(droppedPaths("https://example.test/a.png", dir), []);
  const literal = join(dir, "$(touch SHOULD_NOT_EXIST).png"); writeFileSync(literal, png);
  const drafts = new ImageDrafts([], join(dir, "cache")); assert.equal(drafts.paste(`'${literal}'`, dir), "[Image #1] ");
});

test("numbered images bind to each queued draft, editing and removal; snapshots survive deletion", t => {
  const { dir, path, cache } = fixture(t), drafts = new ImageDrafts([], cache);
  const first = drafts.paste(path, dir), second = drafts.paste(`'${path}' '${path}'`, dir);
  assert.equal(first, "[Image #1] "); assert.equal(second, "[Image #2] [Image #3] ");
  assert.deepEqual(drafts.forText(first).map(i => i.id), [1]); assert.deepEqual(drafts.forText(second).map(i => i.id), [2, 3]);
  assert.deepEqual(drafts.forText("removed"), []); assert.throws(() => drafts.forText("[Image #99]"), /nicht angehängt/);
  const image = drafts.forText(first)[0]; rmSync(path); assert.equal(imageData(image), png.toString("base64"));
  if (process.platform !== "win32") assert.equal(statSync(image.path).mode & 0o777, 0o600);
  const resumed = new ImageDrafts([image], cache); writeFileSync(path, png); assert.equal(resumed.paste(path, dir), "[Image #2] ");
});

test("rejects forged, oversized, missing, symlinked and altered attachments", t => {
  const { dir, path, cache } = fixture(t);
  const wrong = join(dir, "fake.png"); writeFileSync(wrong, "not an image"); assert.throws(() => attachImage(wrong, 1, cache), /unterstütztes Bild/);
  const huge = join(dir, "huge.png"); writeFileSync(huge, Buffer.alloc(5 * 1024 * 1024 + 1)); assert.throws(() => attachImage(huge, 1, cache), /höchstens 5 MB/);
  const link = join(dir, "link.png"); symlinkSync(path, link); assert.throws(() => attachImage(link, 1, cache));
  assert.throws(() => attachImage(join(dir, "missing.png"), 1, cache));
  const image = attachImage(path, 1, cache); writeFileSync(image.path, Buffer.concat([png, Buffer.from("changed")])); assert.throws(() => imageData(image), /verändert/);
});

test("all API families carry actual image bytes; image prompts cannot become local commands", t => {
  const { path, cache } = fixture(t), image = attachImage(path, 1, cache);
  const messages: Message[] = [{ role: "user", content: "Compare [Image #1]", images: [image] }];
  assert.equal((serializeOpenAIMessages(messages)[0].content as any[])[1].image_url.url, `data:image/png;base64,${png.toString("base64")}`);
  assert.deepEqual(serializeAnthropicMessages(messages)[0].content[1], { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } });
  assert.deepEqual(serializeGeminiMessages(messages)[0].parts[1], { inlineData: { mimeType: "image/png", data: png.toString("base64") } });
  assert.equal(classifyLocalInput("!never execute", { images: [image] }), "prompt");
  assert.throws(() => conversationImages([{ ...messages[0], images: Array.from({ length: 21 }, (_, n) => ({ ...image, id: n + 1 })) }]), /Höchstens 20/);
});

test("Codex gets separate --image argv; Claude gets structured blocks and deduplicated text deltas", async t => {
  const { path, cache } = fixture(t), image = attachImage(path, 1, cache), messages: Message[] = [{ role: "user", content: "[Image #1] describe", images: [image] }];
  const codex = [];
  for await (const token of codexCliStream("model", messages, undefined, async function* (args, prompt) {
    assert.equal(args[args.indexOf("--image") + 1], image.path); assert.match(prompt, /Attached images in order: \[Image #1\]/);
    yield JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "seen" } }) + "\n";
  })) codex.push(token.text);
  assert.equal(codex.join(""), "seen");
  const claude = [];
  for await (const token of claudeCliStream("sonnet", messages, undefined, async function* (args, input) {
    assert.equal(args[args.indexOf("--input-format") + 1], "stream-json");
    const request = JSON.parse(input); assert.equal(request.message.content[2].source.data, png.toString("base64"));
    const events = [{ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "seen" } } }, { type: "assistant", message: { content: [{ type: "text", text: "seen" }] } }, { type: "result", result: "seen", is_error: false }].map(e => JSON.stringify(e)).join("\n");
    yield events.slice(0, 31); yield events.slice(31);
  })) claude.push(token.text);
  assert.equal(claude.join(""), "seen");
});

test("rewind restores image metadata with draft, and JSON persistence retains attachment bytes", async t => {
  const { path, cache } = fixture(t), image = attachImage(path, 1, cache);
  const messages: Message[] = [{ role: "user", content: "[Image #1] explain", images: [image] }];
  const result = await rewindConversation(JSON.parse(JSON.stringify(messages)), 0, "restore", async () => "");
  assert.equal(result.draft, messages[0].content); assert.deepEqual(result.images, [image]); assert.equal(imageData(result.images![0]), png.toString("base64"));
});
