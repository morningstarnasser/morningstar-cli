import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CommandRegistry,
  CommandRegistryValidationError,
  MORNINGSTAR_COMMAND_REGISTRY,
  createMorningstarCommandRegistry,
  groupCommandsForHelp,
  normalizeCommandName,
  toAutocompleteItems,
  validateCommandDefinitions,
} from "../src/command-registry.js";
import type {
  CommandDefinition,
  CommandVisibilityOptions,
} from "../src/command-registry.js";

function command(
  id: string,
  name: string,
  overrides: Partial<CommandDefinition> = {},
): CommandDefinition {
  return {
    id,
    name,
    category: "custom",
    description: `Command ${name}`,
    usage: `/${name}`,
    behavior: "immediate",
    whenBusy: "run",
    ...overrides,
  };
}

function expectValidationIssue(
  definitions: readonly CommandDefinition[],
  code: CommandRegistryValidationError["issues"][number]["code"],
): void {
  assert.throws(
    () => new CommandRegistry(definitions),
    (error: unknown) => {
      assert.ok(error instanceof CommandRegistryValidationError);
      assert.ok(
        error.issues.some((validationIssue) => validationIssue.code === code),
        `Expected ${code}, received: ${error.issues.map((validationIssue) => validationIssue.code).join(", ")}`,
      );
      return true;
    },
  );
}

test("built-in Morningstar metadata is valid and normalized", () => {
  assert.ok(MORNINGSTAR_COMMAND_REGISTRY.size >= 100);
  assert.deepEqual(validateCommandDefinitions(MORNINGSTAR_COMMAND_REGISTRY.list()), []);
  assert.equal(normalizeCommandName(" /Memory   Add "), "memory add");

  const graph = MORNINGSTAR_COMMAND_REGISTRY.getById("analysis.graph");
  assert.equal(graph?.name, "graph");
  assert.deepEqual(graph?.aliases, ["deps", "depgraph"]);
  assert.ok(Object.isFrozen(graph));
  assert.ok(Object.isFrozen(graph?.aliases));
});

test("resolves canonical names, compatibility aliases, and the longest input prefix", () => {
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.resolve("/graph")?.id, "analysis.graph");
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.resolve(" /DEPS ")?.id, "analysis.graph");
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.resolve("/new")?.id, "general.clear");
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.resolve("/allowed-tools")?.id, "ai.permissions");
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.resolve("/checkup")?.id, "system.doctor");
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.resolve("/plugin")?.id, "integrations.plugins");

  const canonical = MORNINGSTAR_COMMAND_REGISTRY.resolveInput("/history load My Saved Session");
  assert.equal(canonical?.command.id, "sessions.history-load");
  assert.equal(canonical?.invokedAs, "history load");
  assert.equal(canonical?.args, "My Saved Session");
  assert.equal(canonical?.isAlias, false);

  const alias = MORNINGSTAR_COMMAND_REGISTRY.resolveInput("/RESUME My Saved Session");
  assert.equal(alias?.command.id, "sessions.history-load");
  assert.equal(alias?.invokedAs, "resume");
  assert.equal(alias?.args, "My Saved Session");
  assert.equal(alias?.isAlias, true);
});

test("prefix search is case-insensitive, alias-aware, ranked, and visibility-safe", () => {
  assert.deepEqual(
    MORNINGSTAR_COMMAND_REGISTRY.search("/MEMORY A").map((entry) => entry.name),
    ["memory add"],
  );
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.search("/dep")[0]?.id, "analysis.graph");
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.search("/res").some((entry) => entry.id === "general.clear"), true);
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.search("/res").some((entry) => entry.id === "sessions.history-load"), true);

  assert.deepEqual(MORNINGSTAR_COMMAND_REGISTRY.search("/review"), []);
  assert.deepEqual(MORNINGSTAR_COMMAND_REGISTRY.search("/serve"), []);
  assert.deepEqual(MORNINGSTAR_COMMAND_REGISTRY.search("/pr-comments"), []);
  assert.deepEqual(MORNINGSTAR_COMMAND_REGISTRY.search("/memory delete"), []);
});

test("unimplemented commands require an explicit runtime capability", () => {
  const review = MORNINGSTAR_COMMAND_REGISTRY.resolve("/review");
  assert.ok(review);
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.isAvailable(review), false);
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.isAvailable(review, {
    capabilities: new Set(["command:review"]),
  }), true);

  const visibleWithCapability = MORNINGSTAR_COMMAND_REGISTRY.search("/review", {
    context: { capabilities: new Set(["command:review"]) },
  });
  assert.deepEqual(visibleWithCapability.map((entry) => entry.id), ["ai.review"]);

  const diagnostic = MORNINGSTAR_COMMAND_REGISTRY.search("/review", {
    includeUnavailable: true,
  });
  assert.deepEqual(diagnostic.map((entry) => entry.id), ["ai.review"]);
});

test("hidden and deprecated commands remain resolvable but are not advertised", () => {
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.resolve("/memory delete")?.hidden, true);
  assert.ok(MORNINGSTAR_COMMAND_REGISTRY.resolve("/pr-comments")?.deprecated);

  const allVisibility: CommandVisibilityOptions = {
    includeHidden: true,
    includeDeprecated: true,
    includeUnavailable: true,
  };
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.search("/memory delete", allVisibility).length, 1);
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.search("/pr-comments", allVisibility).length, 1);
});

test("behavior and busy policy describe prompt and local command execution separately", () => {
  const help = MORNINGSTAR_COMMAND_REGISTRY.resolve("/help");
  assert.equal(help?.behavior, "immediate");
  assert.equal(help?.whenBusy, "run");

  const delegate = MORNINGSTAR_COMMAND_REGISTRY.resolve("/delegate");
  assert.equal(delegate?.behavior, "immediate");
  assert.equal(delegate?.whenBusy, "queue");

  const review = MORNINGSTAR_COMMAND_REGISTRY.resolve("/review");
  assert.equal(review?.behavior, "prompt");
  assert.equal(review?.whenBusy, "queue");
});

test("dynamic merge is immutable and supports safe replacement by stable id", () => {
  const base = new CommandRegistry([
    command("custom.first", "first", { aliases: ["one"] }),
  ]);
  const merged = base.merge([
    command("custom.second", "second", {
      behavior: "prompt",
      whenBusy: "queue",
    }),
  ]);

  assert.equal(base.size, 1);
  assert.equal(base.resolve("/second"), undefined);
  assert.equal(merged.size, 2);
  assert.equal(merged.resolve("/second")?.behavior, "prompt");

  const replaced = merged.merge([
    command("custom.first", "renamed", { aliases: ["uno"] }),
  ], { replaceById: true });
  assert.equal(replaced.size, 2);
  assert.equal(replaced.resolve("/first"), undefined);
  assert.equal(replaced.resolve("/one"), undefined);
  assert.equal(replaced.resolve("/uno")?.id, "custom.first");

  expectValidationIssue(
    [
      ...base.list(),
      command("custom.first", "replacement"),
    ],
    "duplicate-id",
  );
});

test("built-in factory merges runtime commands without mutating the singleton", () => {
  const dynamic = command("custom.deploy", "deploy", {
    description: "Deployment-Workflow starten",
    behavior: "prompt",
    whenBusy: "queue",
  });
  const merged = createMorningstarCommandRegistry([dynamic]);

  assert.equal(merged.resolve("/deploy")?.id, "custom.deploy");
  assert.equal(MORNINGSTAR_COMMAND_REGISTRY.resolve("/deploy"), undefined);
  assert.equal(
    merged.toAutocompleteItems().some((item) => item.cmd === "/deploy"),
    true,
  );
});

test("validates duplicate ids and canonical names case-insensitively", () => {
  expectValidationIssue(
    [
      command("custom.same", "first"),
      command("custom.same", "second"),
    ],
    "duplicate-id",
  );
  expectValidationIssue(
    [
      command("custom.first", "Build"),
      command("custom.second", "/build"),
    ],
    "duplicate-name",
  );
});

test("validates aliases against names regardless of declaration order", () => {
  expectValidationIssue(
    [
      command("custom.first", "first", { aliases: ["shared"] }),
      command("custom.second", "shared"),
    ],
    "name-alias-collision",
  );
  expectValidationIssue(
    [
      command("custom.first", "shared"),
      command("custom.second", "second", { aliases: ["/SHARED"] }),
    ],
    "name-alias-collision",
  );
});

test("validates alias-to-alias, repeated, and self-alias collisions", () => {
  expectValidationIssue(
    [
      command("custom.first", "first", { aliases: ["shared"] }),
      command("custom.second", "second", { aliases: ["/SHARED"] }),
    ],
    "alias-collision",
  );
  expectValidationIssue(
    [command("custom.first", "first", { aliases: ["one", "/ONE"] })],
    "duplicate-alias",
  );
  expectValidationIssue(
    [command("custom.first", "first", { aliases: ["/FIRST"] })],
    "self-alias",
  );
});

test("validates malformed metadata with actionable issue codes", () => {
  const malformed = {
    ...command("custom.bad", "bad"),
    usage: "bad",
    behavior: "later",
    whenBusy: "sometimes",
  } as unknown as CommandDefinition;

  const issues = validateCommandDefinitions([malformed]);
  assert.equal(issues.some((validationIssue) => validationIssue.code === "invalid-usage"), true);
  assert.equal(issues.some((validationIssue) => validationIssue.code === "invalid-behavior"), true);
  assert.equal(issues.some((validationIssue) => validationIssue.code === "invalid-busy-behavior"), true);
});

test("help groups use stable category ordering and hide unavailable entries", () => {
  const groups = groupCommandsForHelp(MORNINGSTAR_COMMAND_REGISTRY);
  assert.equal(groups[0]?.category, "general");
  assert.equal(groups[0]?.title, "Allgemein");
  assert.ok(groups.every((group) => group.commands.length > 0));

  const ids = groups.flatMap((group) => group.commands.map((entry) => entry.id));
  assert.equal(ids.includes("ai.review"), false);
  assert.equal(ids.includes("media.serve"), false);
  assert.equal(ids.includes("analysis.pr-comments"), false);
  assert.equal(ids.includes("memory.delete"), false);

  const withReview = groupCommandsForHelp(MORNINGSTAR_COMMAND_REGISTRY, {
    context: { capabilities: new Set(["command:review"]) },
  });
  assert.equal(
    withReview.flatMap((group) => group.commands).some((entry) => entry.id === "ai.review"),
    true,
  );
});

test("autocomplete adapter returns the current App shape without false advertising", () => {
  const items = toAutocompleteItems(MORNINGSTAR_COMMAND_REGISTRY);
  const commands = new Set(items.map((item) => item.cmd));

  assert.deepEqual(Object.keys(items[0] ?? {}).sort(), ["cmd", "desc"]);
  assert.equal(commands.has("/help"), true);
  assert.equal(commands.has("/new"), true);
  assert.equal(commands.has("/usage"), true);
  assert.equal(commands.has("/allowed-tools"), true);
  assert.equal(commands.has("/rename <name>"), false);
  assert.equal(commands.has("/review"), false);
  assert.equal(commands.has("/commit"), false);
  assert.equal(commands.has("/serve"), false);
  assert.equal(commands.has("/pr-comments"), false);
  assert.equal(commands.has("/memory delete"), false);

  assert.deepEqual(
    toAutocompleteItems(MORNINGSTAR_COMMAND_REGISTRY, { prefix: "/memory a" }),
    [{ cmd: "/memory add", desc: "Notiz speichern" }],
  );
  assert.equal(
    toAutocompleteItems(MORNINGSTAR_COMMAND_REGISTRY, { includeAliases: false })
      .some((item) => item.cmd === "/new"),
    false,
  );
  assert.equal(
    toAutocompleteItems(MORNINGSTAR_COMMAND_REGISTRY, { includeDeprecated: true })
      .some((item) => item.cmd === "/pr-comments"),
    true,
  );
});
