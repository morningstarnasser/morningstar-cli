import { join } from "node:path";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPersonaFrom, buildPersonaPrompt, AGENT_NAME, DEFAULT_AGENT_RULES, loadAgentInstructions, seedPersonaDefaults } from "../src/persona.js";

test("agent is named Carry", () => {
  assert.equal(AGENT_NAME, "Carry");
});

test("loads only files that exist", () => {
  const present = new Set([join("/p", "SOUL.md"), join("/p", "USER.md")]);
  const files = loadPersonaFrom(
    "/p",
    (path) => (path.endsWith("SOUL.md") ? "ich bin carry" : "user profile"),
    (path) => present.has(path),
  );
  assert.equal(files.soul, "ich bin carry");
  assert.equal(files.user, "user profile");
  assert.equal(files.memory, undefined);
  assert.equal(files.agents, undefined);
});

test("buildPersonaPrompt assembles present sections with headings", () => {
  const block = buildPersonaPrompt({ soul: "S", user: "U" });
  assert.ok(block.includes("=== IDENTITÄT (SOUL) ===\nS"));
  assert.ok(block.includes("=== ÜBER DEN USER ===\nU"));
  assert.ok(!block.includes("DAUERHAFTES"));
});

test("buildPersonaPrompt is empty when nothing is present", () => {
  assert.equal(buildPersonaPrompt({}), "");
});

test("ordering is SOUL, USER, MEMORY, AGENTS", () => {
  const block = buildPersonaPrompt({ agents: "A", soul: "S", memory: "M", user: "U" });
  const order = ["IDENTITÄT", "ÜBER DEN USER", "DAUERHAFTES", "SUB-AGENTEN"].map((h) => block.indexOf(h));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("working instructions retain the contract with missing, older and customized profiles", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "morningstar-instructions-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(loadAgentInstructions(dir), DEFAULT_AGENT_RULES);
  writeFileSync(join(dir, "AGENTS.md"), "Project-owner preference: use pnpm.");
  writeFileSync(join(dir, "SOUL.md"), "UNRELATED_IDENTITY_DO_NOT_SEND");
  writeFileSync(join(dir, "USER.md"), "UNRELATED_PROFILE_DO_NOT_SEND");
  const prompt = loadAgentInstructions(dir);
  assert.ok(prompt.startsWith(DEFAULT_AGENT_RULES));
  assert.match(prompt, /Project-owner preference: use pnpm/);
  assert.doesNotMatch(prompt, /UNRELATED_/);
  writeFileSync(join(dir, "AGENTS.md"), DEFAULT_AGENT_RULES + "\nCustom preference.");
  assert.equal(loadAgentInstructions(dir).split(DEFAULT_AGENT_RULES).length, 2);
  assert.match(loadAgentInstructions(dir), /Custom preference/);
});

test("new persona defaults fit the loader and seeding preserves existing user instructions", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "morningstar-persona-seed-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.ok(seedPersonaDefaults(dir).includes("AGENTS.md"));
  const seeded = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(seeded.trim().length <= 6000, "all seeded instructions must reach the model");
  assert.equal(loadPersonaFrom(dir).agents, seeded.trim());
  assert.ok(loadAgentInstructions(dir).includes(DEFAULT_AGENT_RULES));
  writeFileSync(join(dir, "AGENTS.md"), "Preserve my instructions.");
  assert.deepEqual(seedPersonaDefaults(dir), []);
  assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), "Preserve my instructions.");
});

test("global working instructions reject oversized files and directory entries", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "morningstar-instructions-limit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "AGENTS.md"), "x".repeat(65537));
  assert.equal(loadAgentInstructions(dir), DEFAULT_AGENT_RULES);
  rmSync(join(dir, "AGENTS.md"));
  // A directory junction works on Windows without symlink privileges.
  symlinkSync(dir, join(dir, "AGENTS.md"), "junction");
  assert.equal(loadAgentInstructions(dir), DEFAULT_AGENT_RULES);
});
