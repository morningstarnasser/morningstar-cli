import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPersonaFrom, buildPersonaPrompt, AGENT_NAME } from "../src/persona.js";

test("agent is named Carry", () => {
  assert.equal(AGENT_NAME, "Carry");
});

test("loads only files that exist", () => {
  const present = new Set(["/p/SOUL.md", "/p/USER.md"]);
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
