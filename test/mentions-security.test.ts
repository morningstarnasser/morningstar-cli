import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  getMentionCompletions,
  parseMentions,
  type MentionResult,
} from "../src/mentions.js";

function mentionText(mentions: MentionResult[]): string {
  return mentions.map((mention) => mention.content).join("\n");
}

test("absolute and parent-traversal file mentions fail closed", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mcli-mentions-path-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  writeFileSync(join(outside, "secret.txt"), "OUTSIDE_FILE_SECRET", "utf-8");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const absoluteHome = parseMentions(
    `inspect @file:${join(homedir(), ".ssh", "id_rsa")}`,
    workspace,
  );
  const absoluteOutside = parseMentions(
    `inspect @file:${join(outside, "secret.txt")}`,
    workspace,
  );
  const traversal = parseMentions(
    "inspect @file:../outside/secret.txt",
    workspace,
  );

  for (const parsed of [absoluteHome, absoluteOutside, traversal]) {
    assert.equal(parsed.mentions.length, 1);
    assert.match(parsed.mentions[0].content, /Zugriff blockiert/);
    assert.doesNotMatch(parsed.mentions[0].content, /OUTSIDE_FILE_SECRET/);
  }
});

test("file and folder symlinks cannot escape the workspace", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mcli-mentions-symlink-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  const secret = join(outside, "secret.txt");
  writeFileSync(secret, "SYMLINK_TARGET_SECRET", "utf-8");
  symlinkSync(secret, join(workspace, "secret-link"));
  symlinkSync(outside, join(workspace, "folder-link"), "dir");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const file = parseMentions("@file:secret-link", workspace);
  const folder = parseMentions("@folder:folder-link", workspace);

  assert.match(mentionText(file.mentions), /Zugriff blockiert/);
  assert.match(mentionText(folder.mentions), /Zugriff blockiert/);
  assert.doesNotMatch(mentionText([...file.mentions, ...folder.mentions]), /SYMLINK_TARGET_SECRET/);
});

test("glob, tree, and codebase walkers skip symlinked external trees", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mcli-mentions-walk-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  mkdirSync(join(workspace, "safe"));
  writeFileSync(
    join(workspace, "safe", "visible.ts"),
    "export const VISIBLE_WORKSPACE_VALUE = 1;\n",
    "utf-8",
  );
  writeFileSync(
    join(outside, "secret.ts"),
    "export const OUTSIDE_CODEBASE_SECRET = 'never expose';\n",
    "utf-8",
  );
  symlinkSync(outside, join(workspace, "external"), "dir");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const parsed = parseMentions("@files:**/*.ts @tree @codebase", workspace);
  const output = mentionText(parsed.mentions);

  assert.match(output, /VISIBLE_WORKSPACE_VALUE|visible\.ts/);
  assert.doesNotMatch(output, /OUTSIDE_CODEBASE_SECRET|secret\.ts|external\//);
});

test("glob traversal and completion traversal cannot enumerate outside files", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mcli-mentions-complete-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  writeFileSync(join(outside, "completion-secret.ts"), "secret", "utf-8");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const parsed = parseMentions("@files:../outside/*.ts", workspace);
  const completions = getMentionCompletions(
    "@file:../outside/completion",
    workspace,
  );

  assert.match(mentionText(parsed.mentions), /Zugriff blockiert/);
  assert.equal(
    completions.some((completion) => completion.includes("completion-secret")),
    false,
  );
});
