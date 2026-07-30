import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkillMeta, searchSkills, checkReadiness, type SkillMeta } from "../src/skills-runtime.js";

test("parses description + requires from frontmatter", () => {
  const md = `---\ndescription: Sendet WhatsApp-Nachrichten\nrequires: whatsapp-cli node\n---\n# WhatsApp\n...`;
  const m = parseSkillMeta(md, "messaging/whatsapp");
  assert.equal(m.name, "messaging/whatsapp");
  assert.equal(m.description, "Sendet WhatsApp-Nachrichten");
  assert.deepEqual(m.requires, ["whatsapp-cli", "node"]);
});

test("falls back to first body line when no frontmatter", () => {
  const m = parseSkillMeta("# Title\n\nMacht etwas Nützliches.\nmehr text", "x/y");
  assert.equal(m.description, "Macht etwas Nützliches.");
  assert.deepEqual(m.requires, []);
});

test("searchSkills matches name and description", () => {
  const skills: SkillMeta[] = [
    { name: "devops/nas", description: "Synology NAS verwalten", requires: [] },
    { name: "creative/image", description: "Bilder generieren", requires: [] },
  ];
  assert.deepEqual(searchSkills("nas", skills).map((s) => s.name), ["devops/nas"]);
  assert.deepEqual(searchSkills("bilder", skills).map((s) => s.name), ["creative/image"]);
  assert.equal(searchSkills("", skills).length, 2);
});

test("checkReadiness honors required commands", () => {
  assert.equal(checkReadiness(["git", "node"], (c) => c !== "node"), false);
  assert.equal(checkReadiness(["git"], () => true), true);
  assert.equal(checkReadiness([], () => false), true);
});
