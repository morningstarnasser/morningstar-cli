import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, retrieve, formatRecall, type BrainMemory } from "../src/brain/retrieve.js";

function mem(id: string, text: string, kind: BrainMemory["kind"] = "note", createdAt = 0): BrainMemory {
  return { id, text, kind, tags: [], createdAt };
}

test("tokenize drops stopwords and short tokens", () => {
  const t = tokenize("The deploy failed on the VPS");
  assert.ok(t.includes("deploy"));
  assert.ok(t.includes("vps"));
  assert.ok(!t.includes("the"));
  assert.ok(!t.includes("on"));
});

test("retrieve ranks the most relevant memory first", () => {
  const memories = [
    mem("1", "Acme uses Prisma with a managed Postgres database"),
    mem("2", "The sample swim school website runs on PHP and jQuery"),
    mem("3", "The deployment service uses a GitHub app on a hosted server"),
  ];
  assert.equal(retrieve("how does the swim school site work", memories, 1)[0].memory.id, "2");
});

test("retrieve returns nothing for an unrelated query", () => {
  assert.equal(retrieve("quantum chromodynamics banana", [mem("1", "Prisma database migrations")]).length, 0);
});

test("retrieve respects k", () => {
  const memories = Array.from({ length: 10 }, (_, i) => mem(String(i), `deploy task number ${i} on vps`));
  assert.equal(retrieve("deploy vps", memories, 3).length, 3);
});

test("recency boosts newer memories on ties", () => {
  const now = 100 * 86_400_000;
  const memories = [mem("old", "deploy vps coolify", "note", 0), mem("new", "deploy vps coolify", "note", now)];
  assert.equal(retrieve("deploy vps coolify", memories, 1, now)[0].memory.id, "new");
});

test("durable kinds outrank ephemeral outcomes on equal relevance", () => {
  const memories = [
    mem("out", "deploy coolify vps fix", "outcome", 0),
    mem("dec", "deploy coolify vps fix", "decision", 0),
  ];
  assert.equal(retrieve("deploy coolify vps fix", memories, 1)[0].memory.id, "dec");
});

test("formatRecall produces a readable block or empty string", () => {
  assert.equal(formatRecall([]), "");
  const block = formatRecall([{ memory: mem("1", "fact about deploy"), score: 1 }]);
  assert.ok(block.includes("Relevante Erinnerungen"));
  assert.ok(block.includes("fact about deploy"));
});
