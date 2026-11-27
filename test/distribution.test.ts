import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
// @ts-ignore JavaScript distribution entrypoint is exercised directly.
import { installedModels, launchArgs, ollamaURL } from "../scripts/launch-ollama.mjs";

const require = createRequire(import.meta.url);
const hygiene = resolve("scripts/check-public-hygiene.mjs");

test("Ollama launch validates host, model catalog and preserves argv as data", async () => {
  assert.equal(ollamaURL("127.0.0.1:11434/"), "http://127.0.0.1:11434");
  assert.equal(ollamaURL("https://ollama.example.test/v1/"), "https://ollama.example.test");
  for (const value of ["file:///tmp/socket", "https://user:secret@example.test", "http://example.test/?secret=x"]) assert.throws(() => ollamaURL(value));
  const models = await installedModels("http://example.test", async (url, opts) => {
    assert.equal(url, "http://example.test/api/tags"); assert.equal(opts.redirect, "error");
    return new Response(JSON.stringify({ models: [{name:"fixture:latest"},{name:"fixture:latest"},{name:"\u001b[31m"}] }));
  });
  assert.deepEqual(models, ["fixture:latest"]);
  await assert.rejects(installedModels("http://example.test", async () => new Response("{}")), /invalid model catalog/);
  await assert.rejects(installedModels("http://example.test", async () => new Response("", {status:503})), /503/);
  assert.deepEqual(launchArgs("ollama/fixture:latest", ["--dir", "a path & echo dangerous"]).slice(1), ["--model", "ollama/fixture:latest", "--dir", "a path & echo dangerous"]);
  assert.throws(() => launchArgs("bad\nname"));
});

test("Pinokio menus follow install and running state without destructive controls", async () => {
  const ui = require("../pinokio/pinokio.js");
  const menu = (exists, running = "") => ui.menu({}, { exists: () => exists, running: name => name === running });
  assert.equal((await menu(false))[0].href, "install.js");
  assert.equal((await menu(true))[0].href, "start.js");
  assert.deepEqual((await menu(true, "start.js")).map(x => x.text), ["Terminal"]);
  assert.deepEqual((await menu(true, "install.js")).map(x => x.text), ["Installing"]);
  assert.deepEqual((await menu(true, "update.js")).map(x => x.text), ["Updating"]);
  assert.ok((await menu(true)).some(x => x.href === "update.js"));
  assert.ok(!(await menu(false)).some(x => x.href === "update.js"));
  assert.equal(require("../pinokio/update.js").run[0].params.message, "node bin/morningstar.js update");
  assert.equal(require("../pinokio/start.js").run[0].params.input, true);
});

test("public hygiene checks working copy and staged blobs separately, including generated files", () => {
  const dir = mkdtempSync(join(tmpdir(), "public-hygiene-"));
  const git = (...args) => execFileSync("git", args, {cwd:dir, stdio:"pipe"});
  const check = (...args) => spawnSync(process.execPath, [hygiene,...args], {cwd:dir, encoding:"utf8"});
  try {
    git("init", "-q");
    writeFileSync(join(dir,"README.md"), "Public documentation\n"); git("add", ".");
    assert.equal(check().status, 0);
    writeFileSync(join(dir,"README.md"), "/" + "Users/actualperson/secret\n");
    assert.equal(check().status, 0, "index remains clean");
    assert.equal(check("--worktree").status, 1);
    git("add", ".");
    writeFileSync(join(dir,"README.md"), "Safe working copy\n");
    assert.equal(check().status, 1, "staged leak cannot hide behind a clean working copy");
    git("add", ".");
    mkdirSync(join(dir,"dist")); writeFileSync(join(dir,"dist","index.js.map"), "https://example" + "-private-archive/repo");
    assert.equal(check("--worktree").status, 1);
    rmSync(join(dir,"dist"), {recursive:true});
    mkdirSync(join(dir,"private")); writeFileSync(join(dir,"private","profile.md"), "personal");
    assert.equal(check("--worktree").status, 1);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("npm package hygiene rejects unexpected data outside a Git checkout", () => {
  const dir = mkdtempSync(join(tmpdir(), "package-hygiene-"));
  const check = () => spawnSync(process.execPath, [hygiene,"--package",dir], {cwd:dir, encoding:"utf8"});
  try {
    writeFileSync(join(dir,"README.md"), "Public package\n");
    mkdirSync(join(dir,"dist"));
    writeFileSync(join(dir,"dist","index.d.ts.map"), "{}\n");
    assert.equal(check().status, 0);
    writeFileSync(join(dir,"session.db"), "private state");
    const bad = check(); assert.equal(bad.status, 1); assert.match(bad.stderr,/unexpected npm package file/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
