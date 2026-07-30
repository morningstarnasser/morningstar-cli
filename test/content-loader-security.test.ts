import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCustomCommands } from "../src/custom-commands.js";
import { loadFileAgents } from "../src/file-agents.js";
import {
  appendProjectMemory,
  createProjectMemory,
  getProjectMemoryPath,
  loadProjectMemory,
} from "../src/project-memory.js";
import { loadRules } from "../src/rules.js";
import { loadSkills } from "../src/skills.js";

function fixture(prefix: string): {
  root: string;
  workspace: string;
  outside: string;
} {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  return { root, workspace, outside };
}

test("custom-command loader ignores linked files and linked project roots", (t) => {
  const { root, workspace, outside } = fixture("mcli-commands-boundary-");
  const commandsDir = join(workspace, ".morningstar", "commands");
  mkdirSync(commandsDir, { recursive: true });
  writeFileSync(join(commandsDir, "safe-command.md"), "# SAFE_COMMAND_CONTENT\n", "utf-8");
  const outsideCommand = join(outside, "outside-command.md");
  writeFileSync(outsideCommand, "# EXTERNAL_COMMAND_SECRET\n", "utf-8");
  symlinkSync(outsideCommand, join(commandsDir, "linked-command.md"));

  const linkedRootWorkspace = join(root, "linked-root-workspace");
  mkdirSync(join(linkedRootWorkspace, ".morningstar"), { recursive: true });
  symlinkSync(outside, join(linkedRootWorkspace, ".morningstar", "commands"), "dir");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const commands = loadCustomCommands(workspace).filter(command => command.source === "project");
  assert.deepEqual(commands.map(command => command.name), ["safe-command"]);
  assert.doesNotMatch(commands.map(command => command.content).join("\n"), /EXTERNAL_COMMAND_SECRET/);
  assert.equal(
    loadCustomCommands(linkedRootWorkspace).some(command => command.source === "project"),
    false,
  );
});

test("project memory never reads or appends through a symlink", (t) => {
  const { root, workspace, outside } = fixture("mcli-memory-boundary-");
  const outsideMemory = join(outside, "memory.md");
  writeFileSync(outsideMemory, "EXTERNAL_MEMORY_SECRET\n", "utf-8");
  symlinkSync(outsideMemory, join(workspace, "MORNINGSTAR.md"));

  const linkedParentWorkspace = join(root, "linked-parent-workspace");
  mkdirSync(linkedParentWorkspace);
  mkdirSync(join(outside, "linked-morningstar"));
  writeFileSync(
    join(outside, "linked-morningstar", "config.md"),
    "EXTERNAL_NESTED_MEMORY_SECRET\n",
    "utf-8",
  );
  symlinkSync(
    join(outside, "linked-morningstar"),
    join(linkedParentWorkspace, ".morningstar"),
    "dir",
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(loadProjectMemory(workspace), null);
  assert.equal(getProjectMemoryPath(workspace), null);
  assert.equal(appendProjectMemory(workspace, "SHOULD_NOT_APPEND"), false);
  assert.throws(
    () => createProjectMemory(workspace, { projectName: "Blocked" }),
    /symbolischer Link/,
  );
  assert.equal(loadProjectMemory(linkedParentWorkspace), null);
});

test("file-agent loader ignores linked files and linked project roots", (t) => {
  const { root, workspace, outside } = fixture("mcli-agents-boundary-");
  const agentsDir = join(workspace, ".morningstar", "agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, "safe-agent.md"),
    "---\nname: Safe Agent\n---\nSAFE_AGENT_PROMPT\n",
    "utf-8",
  );
  const outsideAgent = join(outside, "outside-agent.md");
  writeFileSync(
    outsideAgent,
    "---\nname: External Agent\n---\nEXTERNAL_AGENT_SECRET\n",
    "utf-8",
  );
  symlinkSync(outsideAgent, join(agentsDir, "linked-agent.md"));

  const linkedRootWorkspace = join(root, "linked-root-workspace");
  mkdirSync(join(linkedRootWorkspace, ".morningstar"), { recursive: true });
  symlinkSync(outside, join(linkedRootWorkspace, ".morningstar", "agents"), "dir");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const agents = Object.values(loadFileAgents(workspace))
    .filter(agent => agent.source === "project");
  assert.deepEqual(agents.map(agent => agent.id), ["safe-agent"]);
  assert.doesNotMatch(agents.map(agent => agent.systemPrompt).join("\n"), /EXTERNAL_AGENT_SECRET/);
  assert.equal(
    Object.values(loadFileAgents(linkedRootWorkspace))
      .some(agent => agent.source === "project"),
    false,
  );
});

test("skill loader ignores linked files, SKILL.md links, and linked directories", (t) => {
  const { root, workspace, outside } = fixture("mcli-skills-boundary-");
  const skillsDir = join(workspace, ".morningstar", "skills");
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(
    join(skillsDir, "safe-skill.md"),
    "---\nname: Safe Skill\n---\nSAFE_SKILL_PROMPT\n",
    "utf-8",
  );
  const outsideSkill = join(outside, "outside-skill.md");
  writeFileSync(
    outsideSkill,
    "---\nname: External Skill\n---\nEXTERNAL_SKILL_SECRET\n",
    "utf-8",
  );
  symlinkSync(outsideSkill, join(skillsDir, "linked-flat.md"));

  const linkedFileDir = join(skillsDir, "linked-file-skill");
  mkdirSync(linkedFileDir);
  symlinkSync(outsideSkill, join(linkedFileDir, "SKILL.md"));

  const outsideSkillDir = join(outside, "outside-skill-dir");
  mkdirSync(outsideSkillDir);
  writeFileSync(
    join(outsideSkillDir, "SKILL.md"),
    "---\nname: External Directory Skill\n---\nEXTERNAL_DIRECTORY_SKILL_SECRET\n",
    "utf-8",
  );
  symlinkSync(outsideSkillDir, join(skillsDir, "linked-directory"), "dir");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const skills = loadSkills(workspace).filter(skill => skill.source === "project");
  assert.deepEqual(skills.map(skill => skill.id), ["safe-skill"]);
  assert.doesNotMatch(
    skills.map(skill => skill.content).join("\n"),
    /EXTERNAL_(?:SKILL|DIRECTORY_SKILL)_SECRET/,
  );
});

test("rules and imports remain inside their trust root", (t) => {
  const { root, workspace, outside } = fixture("mcli-rules-boundary-");
  const rulesDir = join(workspace, ".morningstar", "rules");
  mkdirSync(rulesDir, { recursive: true });
  const outsideRule = join(outside, "outside-rule.md");
  writeFileSync(outsideRule, "EXTERNAL_RULE_SECRET\n", "utf-8");
  writeFileSync(join(rulesDir, "included.txt"), "SAFE_IMPORTED_RULE\n", "utf-8");
  symlinkSync(outsideRule, join(rulesDir, "linked-rule.md"));
  symlinkSync(outsideRule, join(rulesDir, "linked-import.md"));
  writeFileSync(
    join(rulesDir, "main.md"),
    [
      "SAFE_MAIN_RULE",
      "@import included.txt",
      `@import ${outsideRule}`,
      "@import ../../../outside/outside-rule.md",
      "@import linked-import.md",
    ].join("\n"),
    "utf-8",
  );
  symlinkSync(outsideRule, join(workspace, "MORNINGSTAR.md"));

  const linkedRootWorkspace = join(root, "linked-root-workspace");
  mkdirSync(join(linkedRootWorkspace, ".morningstar"), { recursive: true });
  symlinkSync(outside, join(linkedRootWorkspace, ".morningstar", "rules"), "dir");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const rules = loadRules(workspace);
  const main = rules.find(rule => rule.id === "main");
  assert.ok(main);
  assert.match(main.content, /SAFE_MAIN_RULE/);
  assert.match(main.content, /SAFE_IMPORTED_RULE/);
  assert.doesNotMatch(rules.map(rule => rule.content).join("\n"), /EXTERNAL_RULE_SECRET/);
  assert.equal(rules.some(rule => rule.id === "linked-rule"), false);
  assert.equal(rules.some(rule => rule.id === "MORNINGSTAR"), false);
  assert.equal(
    loadRules(linkedRootWorkspace).some(rule => rule.source === "project"),
    false,
  );
});
