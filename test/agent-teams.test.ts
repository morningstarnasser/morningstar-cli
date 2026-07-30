import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lstatSync,
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
  addTeamMember,
  createTeam,
  deleteTeam,
  formatTeamDetails,
  getTeam,
  getTeamExecutionOrder,
  listTeams,
  removeTeamMember,
} from "../src/agent-teams.js";

test("team lifecycle validates ids, members, roles, and execution order", (t) => {
  const root = mkdtempSync(join(tmpdir(), "morningstar-teams-"));
  const previous = process.env.MORNINGSTAR_TEAMS_FILE;
  process.env.MORNINGSTAR_TEAMS_FILE = join(root, "teams.json");
  t.after(() => {
    if (previous === undefined) delete process.env.MORNINGSTAR_TEAMS_FILE;
    else process.env.MORNINGSTAR_TEAMS_FILE = previous;
    rmSync(root, { recursive: true, force: true });
  });

  assert.equal(createTeam("__proto__", "bad", "", []).success, false);
  assert.equal(createTeam("ship", "Ship Team", "Build and review", []).success, true);
  assert.equal(statSync(join(root, "teams.json")).mode & 0o777, 0o600);
  assert.equal(createTeam("ship", "Duplicate", "", []).success, false);
  assert.equal(addTeamMember("ship", "code", "lead").success, true);
  assert.equal(addTeamMember("ship", "test", "worker").success, true);
  assert.equal(addTeamMember("ship", "review", "reviewer").success, true);
  assert.equal(addTeamMember("ship", "code", "worker").success, false);
  assert.equal(addTeamMember("ship", "missing-agent", "worker").success, false);
  assert.equal(addTeamMember("ship", "debug", "owner" as never).success, false);

  const team = getTeam("ship");
  assert.ok(team);
  assert.deepEqual(
    getTeamExecutionOrder(team).map(({ agentId }) => agentId),
    ["code", "test", "review"],
  );
  assert.match(formatTeamDetails(team), /code.+lead/);
  assert.equal(listTeams().length, 1);

  assert.equal(removeTeamMember("ship", "test").success, true);
  assert.equal(removeTeamMember("ship", "test").success, false);
  assert.equal(deleteTeam("ship"), true);
  assert.equal(getTeam("ship"), null);
});

test("trusted parent override never follows a final teams-file symlink", (t) => {
  const root = mkdtempSync(join(tmpdir(), "morningstar-teams-link-"));
  const configDir = join(root, "config");
  const outside = join(root, "outside.json");
  const teamsPath = join(configDir, "teams.json");
  mkdirSync(configDir);
  writeFileSync(outside, "DO_NOT_OVERWRITE", "utf-8");
  symlinkSync(outside, teamsPath);

  const previous = process.env.MORNINGSTAR_TEAMS_FILE;
  process.env.MORNINGSTAR_TEAMS_FILE = teamsPath;
  t.after(() => {
    if (previous === undefined) delete process.env.MORNINGSTAR_TEAMS_FILE;
    else process.env.MORNINGSTAR_TEAMS_FILE = previous;
    rmSync(root, { recursive: true, force: true });
  });

  assert.equal(createTeam("safe", "Safe Team", "", []).success, true);
  assert.equal(readFileSync(outside, "utf-8"), "DO_NOT_OVERWRITE");
  assert.equal(lstatSync(teamsPath).isSymbolicLink(), false);
  assert.equal(statSync(teamsPath).mode & 0o777, 0o600);
  assert.equal(getTeam("safe")?.name, "Safe Team");
});
