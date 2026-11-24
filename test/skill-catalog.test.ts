import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSkills, defaultSkillRoots, readCatalogSkill, readSkillResource, type SkillRoot } from "../src/skill-catalog.js";
import { runSkillCommand, listSkills, loadSkill } from "../src/skills-runtime.js";
import { getSkill, createSkill, getSkillPromptAddition } from "../src/skills.js";
function fixture(t: { after: (fn: () => void) => void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "morningstar-catalog-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function skill(root: string, id: string, body = "PROCEDURE", description = "Shared skill") {
  mkdirSync(join(root, id), { recursive: true });
  writeFileSync(join(root, id, "SKILL.md"), `---\nname: ${id}\ndescription: ${description}\n---\n${body}`);
}

test("all roots, system skills and latest cached package versions are discoverable", (t) => {
  const root = fixture(t);
  for (const path of [".agents/skills", ".claude/skills", ".codex/skills", ".codex/skills/.system", ".morningstar/skills"]) skill(join(root, path), path.replaceAll("/", "-").replaceAll(".", ""));
  skill(join(root, ".codex/plugins/cache/example/plugin/1.0.0/skills"), "old");
  skill(join(root, ".codex/plugins/cache/example/plugin/2.0.0/skills"), "new");
  const roots = defaultSkillRoots(join(root, "workspace"), root);
  const catalog = discoverSkills(root, { roots });
  assert(catalog.skills.some((s) => s.id === "new")); assert(!catalog.skills.some((s) => s.id === "old"));
  assert.equal(catalog.skills.length, 6); assert.deepEqual(catalog.warnings, []);
});

test("trusted symlinks are deduplicated, cycles terminate, collisions retain distinct variants", (t) => {
  const root = fixture(t); const shared = join(root, "shared"), mirror = join(root, "mirror");
  skill(shared, "same"); mkdirSync(mirror); symlinkSync(join(shared, "same"), join(mirror, "alias"));
  symlinkSync(mirror, join(mirror, "cycle")); skill(mirror, "same", "VARIANT");
  const roots: SkillRoot[] = [{ path: shared, label: "shared", trusted: true }, { path: mirror, label: "mirror", trusted: true }];
  const catalog = discoverSkills(root, { roots }); assert.equal(catalog.skills.length, 2);
  assert.deepEqual(catalog.skills.map((s) => s.id), ["same", "mirror/same"]);
  assert(readCatalogSkill(catalog.skills[1]).includes("VARIANT"));
});

test("procedure and references load in bounded pages, path traversal and escaping links are denied", (t) => {
  const root = fixture(t); skill(root, "large", "A".repeat(16000) + "END");
  mkdirSync(join(root, "large", "references")); writeFileSync(join(root, "large", "references", "guide.md"), "GUIDE");
  writeFileSync(join(root, "outside.txt"), "SECRET"); symlinkSync(join(root, "outside.txt"), join(root, "large", "link.txt"));
  const roots = [{ path: root, label: "local", trusted: false }]; const catalog = discoverSkills(root, { roots });
  assert.equal(readSkillResource(catalog.skills[0], "references/guide.md"), "GUIDE");
  assert.throws(() => readSkillResource(catalog.skills[0], "../outside.txt"));
  assert.throws(() => readSkillResource(catalog.skills[0], "link.txt"));
  assert(runSkillCommand("load large", root, roots).length < 11000);
  assert(runSkillCommand("load large 10000", root, roots).includes("END"));
  assert(runSkillCommand("load ../outside.txt", root, roots).startsWith("Skill-Fehler:"));
  assert(runSkillCommand("read large ../outside.txt", root, roots).startsWith("Skill-Fehler:"));
  assert.equal(listSkills(root).length, 1); assert(loadSkill("large", root)?.includes("END"));
});

test("multiline description and full activation metadata survive lazy indexing", (t) => {
  const root = fixture(t); const local = join(root, ".morningstar", "skills");
  skill(local, "fixture-skill", "INSTRUCTIONS", ">\n  First line\n  second line");
  const file = join(local, "fixture-skill", "SKILL.md");
  writeFileSync(file, "---\nname: Fixture\ndescription: >\n  First line\n  second line\ntools: [read, grep]\ntriggers: [fixture-trigger]\nagent: developer\ntags: [example]\n---\nINSTRUCTIONS");
  const loaded = getSkill("fixture-skill", root)!;
  assert.equal(loaded.description, "First line second line "); assert.deepEqual(loaded.tools, ["read", "grep"]);
  assert.equal(loaded.agent, "developer"); assert(getSkillPromptAddition(loaded).includes("INSTRUCTIONS"));
  assert.equal(createSkill("../escape", "bad", "", "", {}, root).success, false);
});

test("all list and search results can be paged without loading every procedure", (t) => {
  const root = fixture(t); for (let i = 0; i < 41; i++) skill(root, `skill-${String(i).padStart(2, "0")}`, "BODY MUST STAY LAZY");
  const roots = [{ path: root, label: "test", trusted: false }];
  assert(!runSkillCommand("list", root, roots).includes("BODY MUST STAY LAZY"));
  assert(runSkillCommand("list 2", root, roots).includes("skill-40"));
  assert(runSkillCommand("search Shared --page 2", root, roots).includes("skill-40"));
});

test("valid UTF-8 markdown with NUL examples loads without altering source; binary references are rejected", (t) => {
  const root = fixture(t); skill(root, "examples", "Example byte: \0 and Unicode ü");
  const item = discoverSkills(root, { roots: [{ path: root, label: "test", trusted: false }] }).skills[0];
  assert(readCatalogSkill(item).includes("\0"));
  writeFileSync(join(root, "examples", "binary.dat"), Buffer.from([0xff, 0xfe]));
  assert.throws(() => readSkillResource(item, "binary.dat"));
});
