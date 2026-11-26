import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, symlink, rm, truncate, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DocumentLinks, readDocument, relativeDocumentHref } from "../src/runtime/document-preview.js";

test("file links support spaces, URL encoding and line anchors without changing content", async t => {
  const root = await mkdtemp(join(tmpdir(), "ms-doc-")); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "README.md"), "first\nsecond");
  assert.equal((await readDocument("README.md:2", root)).line, 2);
  const file = join(root, "Meine Anleitung.md"); await writeFile(file, "# Anleitung\nZürich 👩‍💻\nthird");
  for (const href of [file + ":2", pathToFileURL(file).href + "#L2", "Meine%20Anleitung.md:2"]) {
    const doc = await readDocument(href, root, join(root, "vault"));
    assert.equal(doc.line, 2); assert.equal(doc.text, "# Anleitung\nZürich 👩‍💻\nthird"); assert.equal(doc.path, await realpath(file));
  }
  assert.equal(relativeDocumentHref("guide.md", file), join(root, "guide.md"));
});
test("preview refuses traversal, symlink escapes, secrets, binaries, devices, large files and unsafe schemes", async t => {
  const root = await mkdtemp(join(tmpdir(), "ms-doc-")); t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "project"), vault = join(root, "vault"); await mkdir(project); await mkdir(vault);
  await writeFile(join(root, "outside.md"), "outside"); await writeFile(join(project, ".env"), "SECRET=hidden");
  await writeFile(join(project, "binary.bin"), Buffer.from([1, 0, 2]));
  await writeFile(join(project, "large.md"), ""); await truncate(join(project, "large.md"), 600000);
  if (process.platform !== "win32") await symlink(join(root, "outside.md"), join(project, "escape.md"));
  const denied = ["../outside.md", ".env", "%2eenv", "binary.bin", "large.md", ".", "javascript:alert(1)", "https://example.com", "file://host/share/file.md", "\\\\host\\share", "bad\x1b[2J"];
  if (process.platform !== "win32") denied.push("escape.md");
  for (const path of denied) await assert.rejects(readDocument(path, project, vault), undefined, path);
  await writeFile(join(vault, "guide.md"), "allowed vault");
  assert.equal((await readDocument(join(vault, "guide.md"), project, vault)).text, "allowed vault");
  await writeFile(join(project, "safe.md"), "text\x1b]52;c;EVIL\x07\x1b[2J");
  assert.equal((await readDocument("safe.md", project, vault)).text, "text");
});
test("link registry resolves a click on its label, not unrelated printed digits", () => {
  const links = new DocumentLinks(), link = links.register("Vault-Anleitung", "/docs/guide.md")!;
  assert.equal(links.hit(`Siehe ${link.marker}.`, 8)?.href, link.href);
  assert.equal(links.hit(`Other [${link.id}]`, 2), undefined);
  assert.equal(links.register("Vault-Anleitung", "/docs/guide.md")?.id, link.id);
  assert.equal(links.register("unsafe", "javascript:alert(1)"), undefined);
  assert.equal(links.hit("Vault-Anlei\n   tung [" + link.id + "]", 5)?.id, link.id);
  assert.equal(links.hit("Vault-Anleitung\n   [" + link.id + "]", 20)?.id, link.id);
  links.clear(); assert.equal(links.get(link.id), undefined);
});
