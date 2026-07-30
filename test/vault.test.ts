import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVaultArgs, runVaultCommand, type VaultExec } from "../src/vault.js";

test("builds search args against the obsidian collection", () => {
  assert.deepEqual(buildVaultArgs("search", "deploy vps"), ["search", "deploy vps", "-c", "obsidian"]);
  assert.deepEqual(buildVaultArgs("vsearch", "x"), ["vsearch", "x", "-c", "obsidian"]);
});

test("get builds a qmd:// uri or passes one through", () => {
  assert.deepEqual(buildVaultArgs("get", "decisions/foo.md"), ["get", "qmd://obsidian/decisions/foo.md"]);
  assert.deepEqual(buildVaultArgs("get", "qmd://obsidian/x.md"), ["get", "qmd://obsidian/x.md"]);
});

test("unknown subcommand returns null", () => {
  assert.equal(buildVaultArgs("nope", "x"), null);
});

test("bare query is treated as a search", () => {
  const calls: string[][] = [];
  const exec: VaultExec = (args) => { calls.push(args); return "hit"; };
  runVaultCommand("wie war der live-mode fix", exec);
  assert.equal(calls[0][0], "search");
  assert.ok(calls[0].includes("obsidian"));
});

test("explicit search subcommand", () => {
  const exec: VaultExec = (args) => `searched: ${args[1]}`;
  assert.ok(runVaultCommand("search gemini live", exec).includes("gemini live"));
});

test("reports empty results and errors", () => {
  assert.ok(runVaultCommand("search x", () => "").includes("Nichts"));
  assert.ok(runVaultCommand("search x", () => { throw new Error("qmd missing"); }).includes("Vault-Fehler"));
});
