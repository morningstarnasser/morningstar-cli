import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initProjectSettings,
  mergeSettings,
  type MorningstarSettings,
} from "../src/settings.js";

test("project settings cannot add or shadow global MCP servers", () => {
  const global: MorningstarSettings = {
    model: "global-model",
    provider: "openai",
    mcpServers: {
      trusted: { command: "/usr/local/bin/trusted", args: ["--safe"] },
    },
  };
  const local: MorningstarSettings = {
    model: "project-model",
    provider: "openrouter",
    mcpServers: {
      trusted: { command: "/tmp/project-shadow" },
      projectOnly: { command: "/tmp/project-only" },
    },
  };

  const merged = mergeSettings(global, local);

  assert.equal(merged.model, "global-model");
  assert.equal(merged.provider, "openai");
  assert.deepEqual(merged.mcpServers, {
    trusted: { command: "/usr/local/bin/trusted", args: ["--safe"] },
  });
  assert.notEqual(merged.mcpServers, global.mcpServers);
});

test("project-only MCP servers are omitted from merged settings", () => {
  const merged = mergeSettings({}, {
    mcpServers: {
      projectOnly: { command: "/tmp/project-only" },
    },
  });

  assert.equal(merged.mcpServers, undefined);
});

test("project-only provider selection is ignored while non-routing preferences remain local", () => {
  const merged = mergeSettings(
    { temperature: 0.2 },
    {
      model: "attacker/model",
      provider: "openrouter",
      temperature: 0.9,
      maxTokens: 4_096,
    },
  );

  assert.equal(merged.model, undefined);
  assert.equal(merged.provider, undefined);
  assert.equal(merged.temperature, 0.9);
  assert.equal(merged.maxTokens, 4_096);
});

test("settings init creates a gitignore entry even when none existed", (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "morningstar-settings-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));

  const settingsPath = initProjectSettings(workspace);

  assert.equal(readFileSync(join(workspace, ".gitignore"), "utf-8"), ".morningstar/\n");
  if (process.platform !== "win32") {
    assert.equal(statSync(join(workspace, ".morningstar")).mode & 0o777, 0o700);
    assert.equal(statSync(settingsPath).mode & 0o777, 0o600);
  }
});

test("settings writes reject a symlinked settings file", {
  skip: process.platform === "win32",
}, (t) => {
  const root = mkdtempSync(join(tmpdir(), "morningstar-settings-link-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside.json");
  mkdirSync(join(workspace, ".morningstar"), { recursive: true });
  writeFileSync(outside, '{"protected":true}', "utf-8");
  symlinkSync(outside, join(workspace, ".morningstar", "settings.local.json"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.throws(
    () => initProjectSettings(workspace),
    /settings\.local\.json must be a regular file/,
  );
  assert.equal(readFileSync(outside, "utf-8"), '{"protected":true}');
});

test("settings writes reject symlinked project directories and gitignore files", {
  skip: process.platform === "win32",
}, (t) => {
  const root = mkdtempSync(join(tmpdir(), "morningstar-settings-dir-link-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const directoryWorkspace = join(root, "directory-workspace");
  const outsideDirectory = join(root, "outside-directory");
  mkdirSync(directoryWorkspace);
  mkdirSync(outsideDirectory);
  symlinkSync(outsideDirectory, join(directoryWorkspace, ".morningstar"), "dir");
  assert.throws(
    () => initProjectSettings(directoryWorkspace),
    /\.morningstar must be a real directory/,
  );

  const gitignoreWorkspace = join(root, "gitignore-workspace");
  const outsideGitignore = join(root, "outside.gitignore");
  mkdirSync(gitignoreWorkspace);
  writeFileSync(outsideGitignore, "protected\n", "utf-8");
  symlinkSync(outsideGitignore, join(gitignoreWorkspace, ".gitignore"));
  assert.throws(
    () => initProjectSettings(gitignoreWorkspace),
    /\.gitignore must be a regular file/,
  );
  assert.equal(readFileSync(outsideGitignore, "utf-8"), "protected\n");
});
